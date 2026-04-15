import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, parseISO, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { SentimentLabel } from "./supabase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// Formateo de fechas en español
// ============================================================

export function formatRelativeDate(dateString?: string): string {
  if (!dateString) return "Fecha desconocida";
  try {
    return formatDistanceToNow(parseISO(dateString), {
      addSuffix: true,
      locale: es,
    });
  } catch {
    return "Fecha inválida";
  }
}

export function formatShortDate(dateString?: string): string {
  if (!dateString) return "";
  try {
    return format(parseISO(dateString), "dd MMM yyyy", { locale: es });
  } catch {
    return "";
  }
}

export function formatDateInput(dateString?: string): string {
  if (!dateString) return "";
  try {
    return format(parseISO(dateString), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

// ============================================================
// Rangos de fecha predefinidos
// ============================================================

export type DatePreset = "all" | "24h" | "7d" | "30d" | "3m" | "custom";

export interface DateRange {
  preset: DatePreset;
  from?: string; // ISO string
  to?: string;   // ISO string
}

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all",    label: "Siempre" },
  { value: "24h",    label: "24 horas" },
  { value: "7d",     label: "7 días" },
  { value: "30d",    label: "30 días" },
  { value: "3m",     label: "3 meses" },
  { value: "custom", label: "Personalizado" },
];

export function resolveDateRange(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  switch (range.preset) {
    case "all":
      return {};
    case "24h":
      return { from: subDays(now, 1).toISOString(), to: now.toISOString() };
    case "7d":
      return { from: startOfDay(subDays(now, 7)).toISOString(), to: now.toISOString() };
    case "30d":
      return { from: startOfDay(subDays(now, 30)).toISOString(), to: now.toISOString() };
    case "3m":
      return { from: startOfDay(subMonths(now, 3)).toISOString(), to: now.toISOString() };
    case "custom":
      return {
        from: range.from ? startOfDay(parseISO(range.from)).toISOString() : undefined,
        to:   range.to   ? endOfDay(parseISO(range.to)).toISOString()     : now.toISOString(),
      };
    default:
      return {};
  }
}

// ============================================================
// Utilidades de sentimiento (sin emojis — nivel corporativo)
// ============================================================

export const SENTIMENT_CONFIG: Record<
  SentimentLabel,
  { label: string; color: string; bgColor: string; borderColor: string; cssClass: string }
> = {
  positive: {
    label: "Positivo",
    color: "#059669",
    bgColor: "#D1FAE5",
    borderColor: "#6EE7B7",
    cssClass: "sentiment-positive",
  },
  negative: {
    label: "Negativo",
    color: "#DC2626",
    bgColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    cssClass: "sentiment-negative",
  },
  neutral: {
    label: "Neutro",
    color: "#4B5563",
    bgColor: "#F3F4F6",
    borderColor: "#D1D5DB",
    cssClass: "sentiment-neutral",
  },
  mixed: {
    label: "Mixto",
    color: "#7C3AED",
    bgColor: "#EDE9FE",
    borderColor: "#C4B5FD",
    cssClass: "sentiment-mixed",
  },
};

export function getSentimentConfig(label: SentimentLabel | string) {
  return SENTIMENT_CONFIG[label as SentimentLabel] ?? SENTIMENT_CONFIG.neutral;
}

export function getNetSentimentColor(score: number): string {
  if (score >= 60) return "#059669";
  if (score >= 30) return "#65A30D";
  if (score >= 0)  return "#D97706";
  if (score >= -30) return "#EA580C";
  return "#DC2626";
}

export function getNetSentimentLabel(score: number): string {
  if (score >= 60) return "Excelente";
  if (score >= 30) return "Favorable";
  if (score >= 0)  return "Moderado";
  if (score >= -30) return "En riesgo";
  return "Crítico";
}

// ============================================================
// Utilidades de fuentes (sin emojis)
// ============================================================

export const SOURCE_LABELS: Record<string, string> = {
  google_reviews: "Google Reviews",
  reddit:         "Reddit",
  google_alerts:  "Google Alerts",
  twitter_x:      "X (Twitter)",
  facebook:       "Facebook",
  news_web:       "Noticias",
};

export const SOURCE_COLORS: Record<string, string> = {
  google_reviews: "#EA4335",
  reddit:         "#FF4500",
  google_alerts:  "#4285F4",
  twitter_x:      "#000000",
  facebook:       "#1877F2",
  news_web:       "#6B7280",
};

export function getSourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? "Publicación";
}

export function getSourceColor(slug: string): string {
  return SOURCE_COLORS[slug] ?? "#6B7280";
}

// Abreviatura para el badge de idioma
export const LANGUAGE_LABELS: Record<string, string> = {
  es: "ES",
  en: "EN",
  pt: "PT",
};

export function getLanguageLabel(lang?: string): string {
  return lang ? (LANGUAGE_LABELS[lang.toLowerCase()] ?? lang.toUpperCase()) : "ES";
}

// ============================================================
// Categorías de entidad (sin emojis)
// ============================================================

export const CATEGORY_LABELS: Record<string, string> = {
  industrial: "Industrial",
  educacion:  "Educación",
  comercial:  "Comercial",
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? "Entidad";
}

// Mantener por compatibilidad (retorna texto, no emoji)
export function getCategoryIcon(category: string): string {
  return "";
}

// ============================================================
// Formateo de números
// ============================================================

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function formatPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ============================================================
// Desambiguación CAPEX (lógica cliente)
// ============================================================

const CAPEX_INSTITUTION_KEYWORDS = [
  "capacitación", "capacitacion", "taller", "curso", "egresado",
  "formación", "formacion", "técnico", "tecnico", "instructor",
  "estudiante", "centro", "santiago", "rd", "dominicana",
];

const CAPEX_FINANCIAL_KEYWORDS = [
  "capital", "expenditure", "gastos", "inversión", "inversion",
  "ratio", "budget", "financial", "finanzas", "contabilidad",
  "balance", "activos", "depreciacion",
];

export function checkCapexAmbiguity(query: string): {
  isAmbiguous: boolean;
  likelyType: "institution" | "financial" | "ambiguous";
} {
  const lower = query.toLowerCase();

  if (!lower.includes("capex")) {
    return { isAmbiguous: false, likelyType: "ambiguous" };
  }

  const institutionScore = CAPEX_INSTITUTION_KEYWORDS.filter((k) =>
    lower.includes(k)
  ).length;

  const financialScore = CAPEX_FINANCIAL_KEYWORDS.filter((k) =>
    lower.includes(k)
  ).length;

  if (institutionScore > financialScore) {
    return { isAmbiguous: false, likelyType: "institution" };
  } else if (financialScore > institutionScore) {
    return { isAmbiguous: false, likelyType: "financial" };
  }

  return { isAmbiguous: true, likelyType: "ambiguous" };
}

// Genera iniciales para avatar
export function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
