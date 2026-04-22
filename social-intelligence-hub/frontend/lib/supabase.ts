import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// Connection test helper (used by health indicator in footer)
// ============================================================
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("entities").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error desconocido" };
  }
}

// ============================================================
// Types
// ============================================================

export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";

export interface Entity {
  id: string;
  slug: string;
  name: string;
  category: string;
  keywords: string[];
  anti_keywords: string[];
  description?: string;
  active: boolean;
}

export interface Source {
  id: string;
  slug: string;
  name: string;
  icon_url?: string;
}

export interface Mention {
  id: string;
  entity_id: string;
  source_id: string;
  text_original: string;
  author_name?: string;
  author_avatar_url?: string;
  source_url?: string;
  star_rating?: number;
  sentiment_label: SentimentLabel;
  sentiment_score?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  confidence_score?: number;
  dominican_override: boolean;
  dominican_term_found?: string;
  published_at?: string;
  collected_at: string;
  language?: string;
  entities?: Entity;
  sources?: Source;
}

export interface SentimentSummary {
  entity_slug: string;
  entity_name: string;
  category: string;
  total_mentions: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  mixed_count: number;
  positive_pct: number;
  net_sentiment_score: number;
  last_updated?: string;
}

export interface DailyTrend {
  mention_date: string;
  entity_slug: string;
  sentiment_label: SentimentLabel;
  mention_count: number;
}

// ============================================================
// Query helpers
// ============================================================

export async function fetchSentimentSummary(): Promise<SentimentSummary[]> {
  const { data, error } = await supabase
    .from("v_sentiment_summary")
    .select("*")
    .order("total_mentions", { ascending: false });

  if (error) {
    console.error("fetchSentimentSummary error:", error.message);
    throw new Error(`Error en v_sentiment_summary: ${error.message}`);
  }
  return data || [];
}

export async function fetchDailyTrend(
  entitySlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<DailyTrend[]> {
  let query = supabase
    .from("v_daily_trend")
    .select("*")
    .order("mention_date", { ascending: true });

  if (entitySlug) {
    query = query.eq("entity_slug", entitySlug);
  }
  if (dateFrom) {
    query = query.gte("mention_date", dateFrom.substring(0, 10));
  }
  if (dateTo) {
    query = query.lte("mention_date", dateTo.substring(0, 10));
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchDailyTrend error:", error.message);
    throw new Error(`Error en v_daily_trend: ${error.message}`);
  }
  return data || [];
}

export async function fetchMentions(params: {
  entitySlug?: string;
  sentiment?: SentimentLabel | "all";
  sourceSlug?: string;
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Mention[]; count: number }> {
  const {
    entitySlug,
    sentiment,
    sourceSlug,
    searchQuery,
    dateFrom,
    dateTo,
    limit = 20,
    offset = 0,
  } = params;

  let query = supabase
    .from("mentions")
    .select(
      `*, entities(id, slug, name, category), sources(id, slug, name)`,
      { count: "exact" }
    )
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtro por entidad
  if (entitySlug && entitySlug !== "all") {
    const { data: entity } = await supabase
      .from("entities")
      .select("id")
      .eq("slug", entitySlug)
      .single();
    if (entity) {
      query = query.eq("entity_id", entity.id);
    }
  }

  // Filtro por sentimiento
  if (sentiment && sentiment !== "all") {
    query = query.eq("sentiment_label", sentiment);
  }

  // Filtro por fuente
  if (sourceSlug && sourceSlug !== "all") {
    const { data: source } = await supabase
      .from("sources")
      .select("id")
      .eq("slug", sourceSlug)
      .single();
    if (source) {
      query = query.eq("source_id", source.id);
    }
  }

  // Filtro por texto
  if (searchQuery) {
    query = query.ilike("text_original", `%${searchQuery}%`);
  }

  // Filtro por rango de fechas
  if (dateFrom) {
    query = query.gte("published_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("published_at", dateTo);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("fetchMentions error:", error.message);
    throw new Error(`Error en mentions: ${error.message}`);
  }
  return { data: (data as Mention[]) || [], count: count || 0 };
}

export async function fetchEntities(): Promise<Entity[]> {
  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("fetchEntities error:", error.message);
    throw new Error(`Error en entities: ${error.message}`);
  }
  return data || [];
}

export async function fetchSources(): Promise<Source[]> {
  // La tabla sources tiene columna 'active' — la filtramos
  const { data, error } = await supabase
    .from("sources")
    .select("id, slug, name, icon_url")
    .eq("active", true);

  if (error) {
    console.error("fetchSources error:", error.message);
    throw new Error(`Error en sources: ${error.message}`);
  }
  return data || [];
}

export async function fetchTotalStats(
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalMentions: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  netSentiment: number;
  localTermOverrides: number;
}> {
  let query = supabase
    .from("mentions")
    .select("sentiment_label, dominican_override, published_at");

  if (dateFrom) query = query.gte("published_at", dateFrom);
  if (dateTo)   query = query.lte("published_at", dateTo);

  const { data, error } = await query;
  if (error) {
    console.error("fetchTotalStats error:", error.message);
    throw new Error(`Error en stats: ${error.message}`);
  }

  const mentions  = data || [];
  const total     = mentions.length;
  const positive  = mentions.filter((m) => m.sentiment_label === "positive").length;
  const negative  = mentions.filter((m) => m.sentiment_label === "negative").length;
  const neutral   = mentions.filter((m) => m.sentiment_label === "neutral").length;
  const overrides = mentions.filter((m) => m.dominican_override).length;

  return {
    totalMentions:    total,
    positiveCount:    positive,
    negativeCount:    negative,
    neutralCount:     neutral,
    netSentiment:     total > 0 ? Math.round(((positive - negative) / total) * 100) : 0,
    localTermOverrides: overrides,
  };
}
