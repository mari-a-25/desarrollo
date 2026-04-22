import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/stats?dateFrom=...&dateTo=...
 * Retorna estadísticas agregadas de menciones para el período dado.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo   = searchParams.get("dateTo")   ?? undefined;

  try {
    let query = supabase
      .from("mentions")
      .select("sentiment_label, dominican_override, published_at");

    if (dateFrom) query = query.gte("published_at", dateFrom);
    if (dateTo)   query = query.lte("published_at", dateTo);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const mentions  = data ?? [];
    const total     = mentions.length;
    const positive  = mentions.filter((m) => m.sentiment_label === "positive").length;
    const negative  = mentions.filter((m) => m.sentiment_label === "negative").length;
    const neutral   = mentions.filter((m) => m.sentiment_label === "neutral").length;
    const overrides = mentions.filter((m) => m.dominican_override).length;

    return NextResponse.json({
      totalMentions:     total,
      positiveCount:     positive,
      negativeCount:     negative,
      neutralCount:      neutral,
      netSentiment:      total > 0 ? Math.round(((positive - negative) / total) * 100) : 0,
      localTermOverrides: overrides,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
