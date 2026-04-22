import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/search?q=...
 * Búsqueda full-text en menciones existentes de la DB.
 * Para búsqueda en vivo (Reddit/News), usa /api/search-live (POST).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q      = searchParams.get("q") ?? "";
  const limit  = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ data: [], count: 0 });
  }

  const { data, error, count } = await supabase
    .from("mentions")
    .select("*, entities(id, slug, name), sources(id, slug, name)", { count: "exact" })
    .ilike("text_original", `%${q.trim()}%`)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}
