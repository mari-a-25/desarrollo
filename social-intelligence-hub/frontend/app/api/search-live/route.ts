import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * API Route: /api/search-live
 *
 * Cuando el usuario busca un término en el frontend, esta ruta:
 * 1. Busca en Reddit JSON API (público, sin API key)
 * 2. Busca en Google News RSS (público, sin API key)
 * 3. Analiza sentimiento con heurísticas (Azure no está disponible en edge)
 * 4. Guarda las menciones en Supabase
 * 5. Retorna las nuevas menciones encontradas
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Relevance checking ─────────────────────────────────────
const ENTITY_KEYWORDS: Record<string, string[]> = {
  czfs: [
    "zona franca", "czfs", "pivem", "corporacion", "corporación",
    "santiago", "parque industrial", "plazona", "médica czfs",
  ],
  "capex-institucion": [
    "capex", "capacitación", "capacitacion", "taller", "curso",
    "formación", "formacion", "egresado", "técnico", "tecnico",
  ],
  pivem: ["pivem", "parque industrial", "villa europa"],
  plazona: ["plazona", "plaza zona franca"],
  "medica-czfs": ["médica czfs", "medica czfs", "clínica zona franca"],
};

function isRelevant(text: string, searchQuery: string): boolean {
  const lower = text.toLowerCase();
  // Must contain the search query itself
  if (searchQuery && lower.includes(searchQuery.toLowerCase())) return true;
  // Or match any entity keywords
  for (const keywords of Object.values(ENTITY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return true;
  }
  return false;
}

function detectEntity(text: string): string | null {
  const lower = text.toLowerCase();
  // Check most specific first
  for (const [slug, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    const matches = keywords.filter((kw) => lower.includes(kw)).length;
    if (matches >= 1) return slug;
  }
  return null;
}

// ─── Lightweight sentiment (no Azure needed) ─────────────────
const POS_WORDS = [
  "excelente", "bueno", "genial", "increíble", "recomiendo", "profesional",
  "satisfecho", "feliz", "perfecto", "bien", "rápido", "eficiente",
  "calidad", "excellent", "good", "great", "amazing", "recommend",
  "jevi", "nítido", "nitido", "vacano", "bacano", "de primera",
];
const NEG_WORDS = [
  "malo", "pésimo", "terrible", "horrible", "problema", "error",
  "falla", "tarde", "lento", "caro", "mal", "peor", "nunca",
  "bad", "terrible", "horrible", "poor", "slow", "expensive",
  "en olla", "dando carpeta", "manganzón", "arrancao",
];

function analyzeSentiment(text: string) {
  const lower = text.toLowerCase();
  const posCount = POS_WORDS.filter((w) => lower.includes(w)).length;
  const negCount = NEG_WORDS.filter((w) => lower.includes(w)).length;

  if (posCount > negCount)
    return { label: "positive", scores: { positive: 0.75, negative: 0.10, neutral: 0.15 }, confidence: 0.70 };
  if (negCount > posCount)
    return { label: "negative", scores: { positive: 0.10, negative: 0.75, neutral: 0.15 }, confidence: 0.70 };
  return { label: "neutral", scores: { positive: 0.25, negative: 0.20, neutral: 0.55 }, confidence: 0.55 };
}

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  const enWords = ["the ", " and ", " with ", " for ", " from ", " this ", " that "];
  const esWords = ["el ", " las ", " los ", " con ", " para ", " esta ", " que "];
  const enCount = enWords.filter((w) => lower.includes(w)).length;
  const esCount = esWords.filter((w) => lower.includes(w)).length;
  return enCount > esCount ? "en" : "es";
}

function hashText(text: string): string {
  // Simple hash (no crypto needed in edge)
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + text.length.toString(36);
}

// ─── Reddit Search ──────────────────────────────────────────
async function searchReddit(query: string, limit = 15): Promise<any[]> {
  const subreddits = ["Dominican", "RepublicaDominicana", "Santiago"];
  const results: any[] = [];

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=${limit}&t=year`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "SocialIntelligenceHub/1.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const children = data?.data?.children ?? [];
      for (const child of children) {
        const post = child.data;
        if (!post) continue;
        const title = post.title ?? "";
        const selftext = post.selftext ?? "";
        const text = `${title}. ${selftext}`.trim();
        if (text.length < 20) continue;
        if (selftext === "[deleted]" || selftext === "[removed]") continue;

        results.push({
          text: text.substring(0, 2000),
          author: `u/${post.author ?? "[deleted]"}`,
          url: post.permalink ? `https://www.reddit.com${post.permalink}` : "",
          published_at: post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : new Date().toISOString(),
          source: "reddit",
          post_id: post.id ?? "",
        });
      }
    } catch {
      // skip failed subreddit
    }
  }
  return results;
}

// ─── Google News RSS Search ─────────────────────────────────
async function searchGoogleNews(query: string, limit = 15): Promise<any[]> {
  const results: any[] = [];
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+site:do&hl=es-419&gl=DO&ceid=DO:es-419`;
    const res = await fetch(rssUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return results;
    const xml = await res.text();

    // Simple XML parsing (no library needed)
    const items = xml.split("<item>").slice(1, limit + 1);
    for (const item of items) {
      const title = item.match(/<title>(.*?)<\/title>/s)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/s, "$1") ?? "";
      const link = item.match(/<link>(.*?)<\/link>/s)?.[1]?.trim()
        ?? item.match(/<link\/>\s*(https?:\/\/[^\s<]+)/s)?.[1]?.trim() ?? "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] ?? "";
      const source = item.match(/<source[^>]*>(.*?)<\/source>/s)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/s, "$1") ?? "Google News";
      const description = item.match(/<description>(.*?)<\/description>/s)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/s, "$1") ?? "";
      // Clean HTML tags from description
      const cleanDesc = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      const text = cleanDesc || title;
      if (!text || text.length < 20) continue;

      results.push({
        text: text.substring(0, 2000),
        author: source,
        url: link,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: "news_web",
        post_id: "",
      });
    }
  } catch {
    // skip on error
  }
  return results;
}

// ─── Main handler ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body as { query: string };

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: "Query demasiado corta", newMentions: 0 }, { status: 400 });
    }

    const searchQuery = query.trim();

    // Fetch from Reddit + Google News in parallel
    const [redditResults, newsResults] = await Promise.all([
      searchReddit(searchQuery),
      searchGoogleNews(searchQuery),
    ]);

    const allResults = [...redditResults, ...newsResults];

    // Filter for relevance
    const relevant = allResults.filter((r) => isRelevant(r.text, searchQuery));

    if (relevant.length === 0) {
      return NextResponse.json({
        message: `Sin resultados relevantes para "${searchQuery}" en Reddit ni Google News`,
        newMentions: 0,
        searched: allResults.length,
      });
    }

    // Save to Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get source IDs
    const { data: sources } = await supabase.from("sources").select("id, slug");
    const sourceMap: Record<string, string> = {};
    for (const s of sources ?? []) sourceMap[s.slug] = s.id;

    // Get entity IDs
    const { data: entities } = await supabase.from("entities").select("id, slug");
    const entityMap: Record<string, string> = {};
    for (const e of entities ?? []) entityMap[e.slug] = e.id;

    const records = [];
    for (const item of relevant) {
      const sentiment = analyzeSentiment(item.text);
      const entitySlug = detectEntity(item.text);
      const entityId = entitySlug ? entityMap[entitySlug] : null;
      const sourceId = sourceMap[item.source] ?? null;
      const contentHash = `live_${hashText(item.source + item.text.substring(0, 100))}`;

      records.push({
        entity_id: entityId,
        source_id: sourceId,
        text_original: item.text,
        author_name: item.author,
        source_url: item.url,
        sentiment_label: sentiment.label,
        sentiment_score: JSON.stringify(sentiment.scores),
        confidence_score: sentiment.confidence,
        dominican_override: false,
        published_at: item.published_at,
        language: detectLanguage(item.text),
        search_query: searchQuery,
        content_hash: contentHash,
      });
    }

    // Upsert (ignore duplicates)
    const { data: inserted, error } = await supabase
      .from("mentions")
      .upsert(records, { onConflict: "content_hash", ignoreDuplicates: true })
      .select("id");

    const newCount = inserted?.length ?? 0;

    return NextResponse.json({
      message: `Encontradas ${relevant.length} menciones relevantes, ${newCount} nuevas`,
      newMentions: newCount,
      searched: allResults.length,
      relevant: relevant.length,
    });
  } catch (err: any) {
    console.error("search-live error:", err);
    return NextResponse.json(
      { error: err.message ?? "Error interno", newMentions: 0 },
      { status: 500 }
    );
  }
}
