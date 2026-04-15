"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart2, Bell, RefreshCw, Globe,
  ThumbsUp, ThumbsDown, Minus, AlertTriangle, Filter,
} from "lucide-react";
import { KpiCard, NetSentimentCard } from "@/components/KpiCard";
import { TrendChart, SentimentDonut, EntitiesComparisonChart } from "@/components/SentimentChart";
import { MentionCard, MentionCardSkeleton } from "@/components/MentionCard";
import { SearchBar, FilterChips } from "@/components/SearchBar";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  cn, formatShortDate, formatNumber,
  resolveDateRange, type DateRange,
} from "@/lib/utils";
import type { CapexInterpretation } from "@/components/DisambiguationModal";
import {
  fetchSentimentSummary,
  fetchDailyTrend,
  fetchMentions,
  fetchTotalStats,
  type SentimentSummary,
  type DailyTrend,
  type Mention,
  type SentimentLabel,
} from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
interface DashboardState {
  stats: {
    totalMentions: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    netSentiment: number;
    localTermOverrides: number;
  } | null;
  summaries:      SentimentSummary[];
  trends:         DailyTrend[];
  mentions:       Mention[];
  mentionsCount:  number;
  selectedEntity:    string;
  selectedSentiment: string;
  selectedSource:    string;
  searchQuery:    string;
  capexType:      CapexInterpretation;
  dateRange:      DateRange;
  page:           number;
  loadingStats:   boolean;
  loadingCharts:  boolean;
  loadingMentions: boolean;
  lastUpdated:    Date | null;
}

const INITIAL_STATE: DashboardState = {
  stats:             null,
  summaries:         [],
  trends:            [],
  mentions:          [],
  mentionsCount:     0,
  selectedEntity:    "all",
  selectedSentiment: "all",
  selectedSource:    "all",
  searchQuery:       "",
  capexType:         null,
  dateRange:         { preset: "30d" },
  page:              0,
  loadingStats:      true,
  loadingCharts:     true,
  loadingMentions:   true,
  lastUpdated:       null,
};

const MENTIONS_PER_PAGE = 12;

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [state, setState]   = useState<DashboardState>(INITIAL_STATE);
  const feedRef             = useRef<HTMLDivElement>(null);

  const updateState = useCallback((updates: Partial<DashboardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Rango de fechas resuelto
  const resolvedDates = resolveDateRange(state.dateRange);

  // ── Carga de stats + resúmenes ──────────────────────────────
  const loadStats = useCallback(async (dateFrom?: string, dateTo?: string) => {
    try {
      updateState({ loadingStats: true });
      const [stats, summaries] = await Promise.all([
        fetchTotalStats(dateFrom, dateTo),
        fetchSentimentSummary(),
      ]);
      updateState({ stats, summaries, loadingStats: false });
    } catch (err) {
      console.error("Error cargando stats:", err);
      updateState({ loadingStats: false });
    }
  }, [updateState]);

  // ── Carga de tendencias ─────────────────────────────────────
  const loadCharts = useCallback(async (entitySlug?: string, dateFrom?: string, dateTo?: string) => {
    try {
      updateState({ loadingCharts: true });
      const trends = await fetchDailyTrend(
        entitySlug === "all" ? undefined : entitySlug,
        dateFrom,
        dateTo,
      );
      updateState({ trends, loadingCharts: false });
    } catch (err) {
      console.error("Error cargando trends:", err);
      updateState({ loadingCharts: false });
    }
  }, [updateState]);

  // ── Carga de menciones ──────────────────────────────────────
  const loadMentions = useCallback(async (params: {
    entitySlug?: string;
    sentiment?: string;
    searchQuery?: string;
    capexType?: CapexInterpretation;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
  }) => {
    try {
      updateState({ loadingMentions: true });
      const { entitySlug, sentiment, searchQuery, capexType, dateFrom, dateTo, page = 0 } = params;

      let effectiveEntity = entitySlug;
      let effectiveQuery  = searchQuery;

      if (capexType === "institution" && searchQuery?.toLowerCase().includes("capex")) {
        effectiveEntity = "capex-institucion";
        effectiveQuery  = undefined;
      } else if (capexType === "financial") {
        updateState({ mentions: [], mentionsCount: 0, loadingMentions: false });
        return;
      }

      const { data, count } = await fetchMentions({
        entitySlug: effectiveEntity === "all" ? undefined : effectiveEntity,
        sentiment:  sentiment === "all" ? undefined : (sentiment as SentimentLabel),
        searchQuery: effectiveQuery,
        dateFrom,
        dateTo,
        limit:  MENTIONS_PER_PAGE,
        offset: page * MENTIONS_PER_PAGE,
      });

      updateState({
        mentions:      data,
        mentionsCount: count,
        loadingMentions: false,
        lastUpdated: new Date(),
      });
    } catch (err) {
      console.error("Error cargando menciones:", err);
      updateState({ loadingMentions: false });
    }
  }, [updateState]);

  // ── Carga inicial ───────────────────────────────────────────
  useEffect(() => {
    const { from, to } = resolveDateRange(INITIAL_STATE.dateRange);
    loadStats(from, to);
    loadCharts(undefined, from, to);
    loadMentions({ dateFrom: from, dateTo: to, page: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload cuando cambian filtros ───────────────────────────
  useEffect(() => {
    const { from, to } = resolvedDates;
    loadMentions({
      entitySlug:  state.selectedEntity,
      sentiment:   state.selectedSentiment,
      searchQuery: state.searchQuery,
      capexType:   state.capexType,
      dateFrom: from,
      dateTo:   to,
      page:     state.page,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.selectedEntity,
    state.selectedSentiment,
    state.selectedSource,
    state.searchQuery,
    state.capexType,
    state.dateRange,
    state.page,
  ]);

  useEffect(() => {
    const { from, to } = resolvedDates;
    loadCharts(state.selectedEntity, from, to);
    loadStats(from, to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedEntity, state.dateRange]);

  // ── Handlers ────────────────────────────────────────────────
  const handleSearch = useCallback((query: string, capexType?: CapexInterpretation) => {
    updateState({ searchQuery: query, capexType: capexType ?? null, page: 0 });
  }, [updateState]);

  const handleEntityChange = useCallback((entity: string) => {
    updateState({ selectedEntity: entity, page: 0 });
  }, [updateState]);

  // Clic en KPI → filtra el feed y hace scroll a él
  const handleKpiClick = useCallback((sentiment: string) => {
    const next = state.selectedSentiment === sentiment ? "all" : sentiment;
    updateState({ selectedSentiment: next, page: 0 });
    setTimeout(() => feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [state.selectedSentiment, updateState]);

  const handleSentimentChange = useCallback((sentiment: string) => {
    updateState({ selectedSentiment: sentiment, page: 0 });
  }, [updateState]);

  const handleDateRangeChange = useCallback((range: DateRange) => {
    updateState({ dateRange: range, page: 0 });
  }, [updateState]);

  const handleRefresh = useCallback(() => {
    const { from, to } = resolvedDates;
    loadStats(from, to);
    loadCharts(state.selectedEntity, from, to);
    loadMentions({
      entitySlug:  state.selectedEntity,
      sentiment:   state.selectedSentiment,
      searchQuery: state.searchQuery,
      capexType:   state.capexType,
      dateFrom: from,
      dateTo:   to,
      page:     0,
    });
    updateState({ page: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Datos derivados ─────────────────────────────────────────
  const selectedSummary =
    state.summaries.find((s) => s.entity_slug === state.selectedEntity)
    ?? state.summaries[0]
    ?? null;

  const entityFilterOptions = [
    { value: "all", label: "Todas las entidades" },
    ...state.summaries.map((s) => ({
      value: s.entity_slug,
      label: s.entity_name,
      count: s.total_mentions,
    })),
  ];

  const sentimentFilterOptions = [
    { value: "all",      label: "Todos" },
    { value: "positive", label: "Positivos" },
    { value: "negative", label: "Negativos" },
    { value: "neutral",  label: "Neutros"   },
    { value: "mixed",    label: "Mixtos"    },
  ];

  const totalPages   = Math.ceil(state.mentionsCount / MENTIONS_PER_PAGE);
  const positivePct  = state.stats && state.stats.totalMentions > 0
    ? Math.round((state.stats.positiveCount / state.stats.totalMentions) * 100) : 0;
  const negativePct  = state.stats && state.stats.totalMentions > 0
    ? Math.round((state.stats.negativeCount / state.stats.totalMentions) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">

      {/* ────── HEADER ────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">

          {/* Brand */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="p-1.5 rounded-lg bg-czfs-blue">
              <BarChart2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-czfs-navy leading-tight">
                Social Intelligence Hub
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                CZFS &amp; CAPEX
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xl">
            <SearchBar
              onSearch={handleSearch}
              loading={state.loadingMentions}
              initialValue={state.searchQuery}
            />
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {state.lastUpdated && (
              <span className="text-xs text-muted-foreground hidden md:block">
                Actualizado {formatShortDate(state.lastUpdated.toISOString())}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground",
                (state.loadingStats || state.loadingMentions) && "animate-spin"
              )} />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors relative">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-red-500 rounded-full" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-7">

        {/* ────── FILTRO DE PERÍODO (visible en toda la página) ────── */}
        <section className="bg-card border rounded-xl px-5 py-3.5 shadow-sm">
          <DateRangeFilter
            value={state.dateRange}
            onChange={handleDateRangeChange}
          />
        </section>

        {/* ────── CAPA ESTRATÉGICA: KPIs ────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Salud de la Marca
            </h2>
            <p className="text-xs text-muted-foreground">
              Los indicadores son interactivos — haz clic para filtrar el feed
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

            {/* Gauge Sentimiento Neto */}
            <div className="col-span-2 md:col-span-1">
              <NetSentimentCard
                score={state.stats?.netSentiment ?? 0}
                totalMentions={state.stats?.totalMentions ?? 0}
                loading={state.loadingStats}
                onClick={() => handleKpiClick("all")}
                active={state.selectedSentiment === "all"}
              />
            </div>

            <KpiCard
              title="Total Menciones"
              value={formatNumber(state.stats?.totalMentions ?? 0)}
              subtitle="en el período"
              icon={<Globe className="h-4 w-4" />}
              accentColor="#1E3A8A"
              loading={state.loadingStats}
              active={state.selectedSentiment === "all"}
              onClick={() => handleKpiClick("all")}
            />

            <KpiCard
              title="Menciones Positivas"
              value={formatNumber(state.stats?.positiveCount ?? 0)}
              subtitle={`${positivePct}% del total`}
              icon={<ThumbsUp className="h-4 w-4" />}
              accentColor="#059669"
              loading={state.loadingStats}
              active={state.selectedSentiment === "positive"}
              onClick={() => handleKpiClick("positive")}
            />

            <KpiCard
              title="Menciones Negativas"
              value={formatNumber(state.stats?.negativeCount ?? 0)}
              subtitle={`${negativePct}% del total`}
              icon={<ThumbsDown className="h-4 w-4" />}
              accentColor="#DC2626"
              loading={state.loadingStats}
              active={state.selectedSentiment === "negative"}
              onClick={() => handleKpiClick("negative")}
            />

            <KpiCard
              title="Neutras"
              value={formatNumber(state.stats?.neutralCount ?? 0)}
              subtitle="sin polaridad definida"
              icon={<Minus className="h-4 w-4" />}
              accentColor="#4B5563"
              loading={state.loadingStats}
              active={state.selectedSentiment === "neutral"}
              onClick={() => handleKpiClick("neutral")}
            />
          </div>
        </section>

        {/* ────── CAPA TÁCTICA: Gráficos ────── */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Análisis de Tendencias
            </h2>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Entidad:</span>
              <select
                value={state.selectedEntity}
                onChange={(e) => handleEntityChange(e.target.value)}
                className="text-xs border rounded-lg px-2.5 py-1.5 bg-white text-foreground
                           focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {entityFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <TrendChart
                data={state.trends}
                loading={state.loadingCharts}
                entitySlug={state.selectedEntity === "all" ? undefined : state.selectedEntity}
                onBarClick={(sentiment) => handleKpiClick(sentiment)}
              />
            </div>
            <SentimentDonut
              summary={selectedSummary}
              loading={state.loadingStats}
              onSliceClick={(sentiment) => handleKpiClick(sentiment)}
            />
          </div>

          {state.summaries.length > 1 && (
            <div className="mt-4">
              <EntitiesComparisonChart
                summaries={state.summaries}
                loading={state.loadingStats}
                onEntityClick={(slug) => handleEntityChange(slug)}
              />
            </div>
          )}
        </section>

        {/* ────── CAPA OPERATIVA: Feed ────── */}
        <section ref={feedRef}>
          <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Feed de Menciones
              </h2>
              {!state.loadingMentions && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {state.mentionsCount.toLocaleString()} resultados
                  {state.selectedSentiment !== "all" && ` · ${state.selectedSentiment}`}
                  {state.searchQuery && ` · "${state.searchQuery}"`}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <FilterChips
                options={sentimentFilterOptions}
                selected={state.selectedSentiment}
                onChange={handleSentimentChange}
              />
            </div>
          </div>

          {/* Aviso CAPEX financiero */}
          {state.capexType === "financial" && (
            <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  CAPEX financiero está fuera del ámbito de monitoreo
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Este hub monitorea CZFS y CAPEX como institución educativa.
                  Para Capital Expenditure, usa herramientas financieras especializadas.
                </p>
              </div>
            </div>
          )}

          {/* Grid */}
          {state.loadingMentions ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <MentionCardSkeleton key={i} />)}
            </div>
          ) : state.mentions.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl bg-card">
              <p className="text-sm font-medium text-foreground">Sin menciones para los filtros seleccionados</p>
              <p className="text-xs text-muted-foreground mt-1">
                Prueba cambiando el período, la entidad o los filtros de sentimiento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {state.mentions.map((mention) => (
                <MentionCard key={mention.id} mention={mention} />
              ))}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => updateState({ page: Math.max(0, state.page - 1) })}
                disabled={state.page === 0}
                className="px-4 py-2 text-xs font-medium rounded-lg border hover:bg-muted
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Página {state.page + 1} de {totalPages}
              </span>
              <button
                onClick={() => updateState({ page: Math.min(totalPages - 1, state.page + 1) })}
                disabled={state.page >= totalPages - 1}
                className="px-4 py-2 text-xs font-medium rounded-lg border hover:bg-muted
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </section>

        {/* ────── FOOTER ────── */}
        <footer className="border-t pt-5 pb-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-czfs-blue">CZFS</span>
              <span>·</span>
              <span>Social Intelligence Hub</span>
              <span>·</span>
              <span>v0.1.0</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                Supabase conectado
              </span>
              <span>Análisis: Azure AI Language · ES / EN</span>
              <span>Stack: Next.js 15 · Tailwind · Recharts</span>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
