"use client";

import { useState, useCallback, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn, checkCapexAmbiguity } from "@/lib/utils";
import {
  DisambiguationModal,
  type CapexInterpretation,
} from "./DisambiguationModal";

interface SearchBarProps {
  onSearch: (query: string, capexType?: CapexInterpretation) => void;
  initialValue?: string;
  placeholder?: string;
  loading?: boolean;
  className?: string;
}

export function SearchBar({
  onSearch,
  initialValue = "",
  placeholder = "Buscar por término, autor, fuente…",
  loading = false,
  className,
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const [showDisambiguation, setShowDisambiguation] = useState(false);
  const [pendingQuery, setPendingQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;

      const { isAmbiguous } = checkCapexAmbiguity(trimmed);
      if (isAmbiguous) {
        setPendingQuery(trimmed);
        setShowDisambiguation(true);
      } else {
        onSearch(trimmed);
      }
    },
    [value, onSearch]
  );

  const handleDisambiguationSelect = useCallback(
    (interpretation: CapexInterpretation) => {
      setShowDisambiguation(false);
      onSearch(pendingQuery, interpretation);
    },
    [pendingQuery, onSearch]
  );

  const handleClear = useCallback(() => {
    setValue("");
    onSearch("");
    inputRef.current?.focus();
  }, [onSearch]);

  return (
    <>
      <form onSubmit={handleSubmit} className={cn("relative flex items-center", className)}>
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            : <Search className="h-4 w-4 text-muted-foreground" />
          }
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") handleClear(); }}
          placeholder={placeholder}
          className={cn(
            "w-full h-11 pl-10 pr-24 rounded-xl border bg-white",
            "text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-all duration-150 shadow-sm"
          )}
          disabled={loading}
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-16 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !value.trim()}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3 rounded-lg text-xs font-semibold",
            "bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:bg-primary/90 transition-colors"
          )}
        >
          Buscar
        </button>
      </form>

      <DisambiguationModal
        isOpen={showDisambiguation}
        query={pendingQuery}
        onSelect={handleDisambiguationSelect}
        onClose={() => setShowDisambiguation(false)}
      />
    </>
  );
}

// ============================================================
// Filtros chip (sentimiento, entidad, fuente)
// ============================================================

interface FilterChipsProps {
  options: Array<{ value: string; label: string; count?: number }>;
  selected: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterChips({ options, selected, onChange, className }: FilterChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium",
            "transition-all duration-100",
            selected === option.value
              ? "bg-czfs-blue text-white border-czfs-blue shadow-sm"
              : "bg-white text-muted-foreground border-border hover:border-czfs-blue/40 hover:text-foreground"
          )}
        >
          {option.label}
          {option.count != null && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0 rounded-full",
                selected === option.value
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
