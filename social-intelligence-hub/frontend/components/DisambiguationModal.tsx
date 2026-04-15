"use client";

import { useState } from "react";
import { GraduationCap, TrendingUp, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type CapexInterpretation = "institution" | "financial" | null;

interface DisambiguationModalProps {
  isOpen: boolean;
  query: string;
  onSelect: (interpretation: CapexInterpretation) => void;
  onClose: () => void;
}

const OPTIONS = [
  {
    id: "institution" as const,
    icon: GraduationCap,
    title: "CAPEX — Institución Educativa",
    subtitle: "Centro de Innovación y Capacitación Profesional",
    description:
      "Buscar menciones, reseñas y publicaciones sobre los cursos, talleres y programas de formación técnica de CAPEX en Santiago, RD.",
    keywords: ["capacitación", "taller", "cursos", "egresados", "Santiago"],
    color: "#1E3A8A",
    bgColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  {
    id: "financial" as const,
    icon: TrendingUp,
    title: "CAPEX — Término Financiero",
    subtitle: "Capital Expenditure / Gastos de Capital",
    description:
      "Buscar análisis sobre gastos de capital, inversiones en activos fijos, reportes financieros y métricas contables.",
    keywords: ["inversión", "activos fijos", "balance", "finanzas"],
    color: "#92400E",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
];

export function DisambiguationModal({
  isOpen,
  query,
  onSelect,
  onClose,
}: DisambiguationModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border animate-fade-in">
        {/* Header */}
        <div className="flex items-start gap-3 p-6 pb-4 border-b">
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 flex-shrink-0">
            <HelpCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              Desambiguación del término{" "}
              <span className="text-primary font-bold">"{query}"</span>
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              El término es ambiguo. Selecciona la interpretación correcta
              para obtener resultados precisos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Opciones */}
        <div className="p-6 space-y-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const isHovered = hovered === option.id;

            return (
              <button
                key={option.id}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all duration-150",
                  isHovered ? "shadow-md -translate-y-0.5" : "hover:shadow-md hover:-translate-y-0.5"
                )}
                style={{
                  backgroundColor: isHovered ? option.bgColor : "white",
                  borderColor: isHovered ? option.color : option.borderColor,
                }}
                onMouseEnter={() => setHovered(option.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(option.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="p-2 rounded-lg flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${option.color}12` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: option.color }} />
                  </div>

                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: option.color }}>
                      {option.title}
                    </p>
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      {option.subtitle}
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {option.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {option.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: `${option.color}10`,
                            color: option.color,
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  <span
                    className="text-lg transition-transform duration-150 mt-1"
                    style={{
                      color: option.color,
                      transform: isHovered ? "translateX(4px)" : "none",
                    }}
                  >
                    →
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 pb-5">
          <p className="text-xs text-center text-gray-400">
            La selección filtrará los resultados usando palabras clave de contexto
            para eliminar la ambigüedad semántica.
          </p>
        </div>
      </div>
    </div>
  );
}
