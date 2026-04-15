"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { DailyTrend, SentimentSummary } from "@/lib/supabase";

const SENTIMENT_COLORS = {
  positive: "#059669",
  negative: "#DC2626",
  neutral:  "#4B5563",
  mixed:    "#7C3AED",
};

const SENTIMENT_LABELS = {
  positive: "Positivo",
  negative: "Negativo",
  neutral:  "Neutro",
  mixed:    "Mixto",
};

// ============================================================
// Gráfico de tendencia temporal (área apilada)
// ============================================================

interface TrendChartProps {
  data: DailyTrend[];
  loading?: boolean;
  entitySlug?: string;
  onBarClick?: (sentiment: string) => void;
}

export function TrendChart({ data, loading, entitySlug, onBarClick }: TrendChartProps) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <div className="skeleton h-4 w-40 rounded mb-6" />
        <div className="skeleton h-48 w-full rounded" />
      </div>
    );
  }

  const filtered = entitySlug ? data.filter((d) => d.entity_slug === entitySlug) : data;

  const dateMap: Record<string, Record<string, number>> = {};
  filtered.forEach((item) => {
    if (!dateMap[item.mention_date]) {
      dateMap[item.mention_date] = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    }
    dateMap[item.mention_date][item.sentiment_label] =
      (dateMap[item.mention_date][item.sentiment_label] || 0) + item.mention_count;
  });

  const chartData = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      dateLabel: (() => {
        try { return format(parseISO(date), "dd MMM", { locale: es }); }
        catch { return date; }
      })(),
      ...counts,
    }));

  if (chartData.length === 0) {
    return (
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-4">Tendencia de Menciones</p>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-lg">
          Sin datos para el período seleccionado
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground mb-1">Tendencia de Menciones</p>
      <p className="text-xs text-muted-foreground mb-4">
        Evolución diaria · haz clic en la leyenda para filtrar
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
          <defs>
            {Object.entries(SENTIMENT_COLORS).map(([key, color]) => (
              <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "white", border: "1px solid #e5e7eb",
              borderRadius: "8px", fontSize: "12px",
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          {Object.entries(SENTIMENT_COLORS).map(([key, color]) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={SENTIMENT_LABELS[key as keyof typeof SENTIMENT_LABELS]}
              stackId="1"
              stroke={color}
              fill={`url(#grad-${key})`}
              strokeWidth={2}
              style={onBarClick ? { cursor: "pointer" } : {}}
              onClick={() => onBarClick?.(key)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Donut de distribución de sentimiento
// ============================================================

interface SentimentDonutProps {
  summary: SentimentSummary | null;
  loading?: boolean;
  onSliceClick?: (sentiment: string) => void;
}

export function SentimentDonut({ summary, loading, onSliceClick }: SentimentDonutProps) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <div className="skeleton h-4 w-36 rounded mb-6" />
        <div className="skeleton h-36 w-36 rounded-full mx-auto" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-card rounded-xl border p-5 shadow-sm flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground text-sm">Sin datos de sentimiento</p>
      </div>
    );
  }

  const pieData = [
    { name: "Positivo", key: "positive", value: summary.positive_count },
    { name: "Negativo", key: "negative", value: summary.negative_count },
    { name: "Neutro",   key: "neutral",  value: summary.neutral_count  },
    { name: "Mixto",    key: "mixed",    value: summary.mixed_count    },
  ]
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, color: SENTIMENT_COLORS[d.key as keyof typeof SENTIMENT_COLORS] }));

  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground mb-1">
        Distribución de Sentimiento
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        {summary.entity_name}
        {onSliceClick && " · haz clic en un segmento para filtrar"}
      </p>

      <ResponsiveContainer width="100%" height={185}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%" cy="50%"
            innerRadius={48} outerRadius={72}
            paddingAngle={3}
            dataKey="value"
            style={onSliceClick ? { cursor: "pointer" } : {}}
            onClick={(d) => onSliceClick?.(d.key)}
          >
            {pieData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value} (${summary.total_mentions > 0
                ? Math.round((value / summary.total_mentions) * 100) : 0}%)`,
              name,
            ]}
            contentStyle={{
              backgroundColor: "white", border: "1px solid #e5e7eb",
              borderRadius: "8px", fontSize: "12px",
            }}
          />
          <Legend
            iconType="circle" iconSize={8}
            formatter={(v) => <span style={{ fontSize: "11px", color: "#6b7280" }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Comparativa de entidades (barras horizontales)
// ============================================================

interface EntitiesComparisonChartProps {
  summaries: SentimentSummary[];
  loading?: boolean;
  onEntityClick?: (entitySlug: string) => void;
}

export function EntitiesComparisonChart({
  summaries,
  loading,
  onEntityClick,
}: EntitiesComparisonChartProps) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <div className="skeleton h-4 w-44 rounded mb-6" />
        <div className="skeleton h-32 w-full rounded" />
      </div>
    );
  }

  const chartData = summaries.map((s) => ({
    name:      s.entity_name.length > 18 ? s.entity_name.substring(0, 16) + "…" : s.entity_name,
    slug:      s.entity_slug,
    Positivo:  s.positive_count,
    Negativo:  s.negative_count,
    Neutro:    s.neutral_count,
  }));

  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground mb-1">
        Comparativa por Entidad
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Menciones por polaridad
        {onEntityClick && " · haz clic en una barra para filtrar"}
      </p>
      <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
          style={onEntityClick ? { cursor: "pointer" } : {}}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <YAxis
            type="category" dataKey="name"
            tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white", border: "1px solid #e5e7eb",
              borderRadius: "8px", fontSize: "12px",
            }}
          />
          <Bar dataKey="Positivo" fill={SENTIMENT_COLORS.positive} radius={[0, 0, 0, 0]} stackId="a"
               onClick={(d) => onEntityClick?.(d.slug)} />
          <Bar dataKey="Neutro"   fill={SENTIMENT_COLORS.neutral}  radius={[0, 0, 0, 0]} stackId="a"
               onClick={(d) => onEntityClick?.(d.slug)} />
          <Bar dataKey="Negativo" fill={SENTIMENT_COLORS.negative} radius={[0, 4, 4, 0]} stackId="a"
               onClick={(d) => onEntityClick?.(d.slug)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
