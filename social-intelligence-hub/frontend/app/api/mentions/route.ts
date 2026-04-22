import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/mentions?entitySlug=...&sentiment=...&limit=20&offset=0
 * Retorna menciones paginadas con filtros opcionales.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entitySlug  = searchParams.get("entitySlug")  ?? undefined;
  const sentiment   = searchParams.get("sentiment")   ?? undefined;
  const searchQuery = searchParams.get("q")           ?? undefined;
  const dateFrom    = searchParams.get("dateFrom")    ?? undefined;
  const dateTo      = searchParams.get("dateTo")      ?? undefined;
  const limit       = parseInt(searchParams.get("limit")  ?? "20", 10);
  const offset      = parseInt(searchParams.get("offset") ?? "0",  10);

  let query = supabase
    .from("mentions")
    .select("*, entities(id, slug, name, category), sources(id, slug, name)", { count: "exact" })
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entitySlug && entitySlug !== "all") {
    const { data: entity } = await supabase
      .from("entities").select("id").eq("slug", entitySlug).single();
    if (entity) query = query.eq("entity_id", entity.id);
  }

  if (sentiment && sentiment !== "all") {
    query = query.eq("sentiment_label", sentiment);
  }

  if (searchQuery) {
    query = query.ilike("text_original", `%${searchQuery}%`);
  }

  if (dateFrom) query = query.gte("published_at", dateFrom);
  if (dateTo)   query = query.lte("published_at", dateTo);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}
