"""
Motor de Lexicón Dominicano
Post-procesamiento de sentimiento para Español Dominicano (Cibao / Santiago)
"""

# ============================================================
# TÉRMINOS POSITIVOS DOMINICANOS
# ============================================================
POSITIVE_TERMS = {
    # Calidad / Excelencia
    "jevi": "excelente, de alta calidad",
    "jevy": "excelente, de alta calidad",
    "nítido": "perfecto, excelente",
    "nitido": "perfecto, excelente",
    "brutal": "increíble, muy bueno (uso coloquial positivo)",
    "chévere": "genial, bueno",
    "chevere": "genial, bueno",
    "vacano": "excelente, genial",
    "bacano": "excelente, cool",
    "de primera": "de primera calidad",
    "tremendo": "impresionante (positivo)",
    "metío": "comprometido, dedicado",
    "metio": "comprometido, dedicado",
    "arriba": "funcionando bien",
    "bien montao": "bien organizado, de calidad",
    "bien montado": "bien organizado, de calidad",
    "pa' arriba": "en alza, mejorando",
    "pa arriba": "en alza, mejorando",
    "empujando": "trabajando duro (positivo)",
    "dando pa' lante": "progresando",
    "dando pa lante": "progresando",
    "de ley": "de confianza, legítimo",
    "veloz": "rápido (positivo)",
    "lo máximo": "lo mejor",
    "lo maximo": "lo mejor",
    "efectivo": "eficiente (positivo contextual)",
    "enchulao": "bien equipado, moderno",
    "enchulado": "bien equipado, moderno",
}

# ============================================================
# TÉRMINOS NEGATIVOS DOMINICANOS
# ============================================================
NEGATIVE_TERMS = {
    # Problemas / Mal estado
    "en olla": "en problemas, funcionando mal",
    "dando carpeta": "actuando de forma negligente, fallando",
    "dando carpeta con": "fallando en, siendo negligente con",
    "en la luna": "desconectado, irresponsable",
    "arranca'o": "sin recursos, en mal estado",
    "arrancao": "sin recursos, en mal estado",
    "prendio": "en caos, fuera de control",
    "prendío": "en caos, fuera de control",
    "manganzón": "perezoso, ineficiente",
    "manganzon": "perezoso, ineficiente",
    "emberracado": "muy molesto, furioso",
    "emberracao": "muy molesto, furioso",
    "jodido": "en problemas graves",
    "jodio": "en problemas graves",
    "peor que antes": "ha empeorado",
    "desmadre": "desorden total, caos",
    "pachá": "lento, ineficiente",
    "pacha": "lento, ineficiente",
    "jalabola": "adulador sin criterio (negativo contextual)",
    "picao": "molesto, ofendido",
    "picado": "molesto, ofendido (coloquial)",
    "caído": "sin funcionar, caído",
    "caido": "sin funcionar, caído",
    "desamparado": "sin apoyo institucional",
    "botao": "abandonado, descuidado",
    "botado": "abandonado, descuidado",
    "en crisis": "en situación crítica",
}

# ============================================================
# FRASES DE CONTEXTO PARA DESAMBIGUACIÓN CAPEX
# ============================================================
CAPEX_INSTITUTION_SIGNALS = [
    "capex", "santiago", "capacitación", "capacitacion", "taller",
    "curso", "egresado", "egresados", "formación", "formacion",
    "técnico", "tecnico", "instructor", "estudiante", "centro",
    "capex santiago", "capex rd", "capex dominicana",
]

CAPEX_FINANCIAL_SIGNALS = [
    "capital expenditure", "gastos de capital", "inversión de capital",
    "capex ratio", "capex total", "capex budget", "financial", "finanzas",
    "contabilidad", "balance sheet", "balance general", "activos fijos",
    "depreciación", "depreciacion", "amortización",
]


def detect_dominican_sentiment(text: str) -> dict:
    """
    Analiza el texto en busca de términos dominicanos.
    Retorna override de sentimiento si se detecta algún término.

    Returns:
        {
            "override": bool,
            "sentiment": "positive" | "negative" | None,
            "term_found": str | None,
            "term_meaning": str | None,
        }
    """
    text_lower = text.lower()

    # Verificar términos positivos
    for term, meaning in POSITIVE_TERMS.items():
        if term in text_lower:
            return {
                "override": True,
                "sentiment": "positive",
                "term_found": term,
                "term_meaning": meaning,
            }

    # Verificar términos negativos
    for term, meaning in NEGATIVE_TERMS.items():
        if term in text_lower:
            return {
                "override": True,
                "sentiment": "negative",
                "term_found": term,
                "term_meaning": meaning,
            }

    return {
        "override": False,
        "sentiment": None,
        "term_found": None,
        "term_meaning": None,
    }


def disambiguate_capex(text: str) -> str:
    """
    Determina si 'CAPEX' en el texto se refiere a la institución
    educativa o al término financiero.

    Returns:
        "institution" | "financial" | "ambiguous"
    """
    text_lower = text.lower()

    institution_score = sum(
        1 for signal in CAPEX_INSTITUTION_SIGNALS if signal in text_lower
    )
    financial_score = sum(
        1 for signal in CAPEX_FINANCIAL_SIGNALS if signal in text_lower
    )

    if institution_score > financial_score:
        return "institution"
    elif financial_score > institution_score:
        return "financial"
    else:
        return "ambiguous"


def normalize_dominican_text(text: str) -> str:
    """
    Normaliza caracteres comunes del español dominicano informal
    para mejorar el procesamiento NLP.
    """
    replacements = {
        "'": "'",
        "ñ": "n",   # solo para búsqueda, no para display
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
    }
    # No hacemos normalización agresiva para no perder contexto lingüístico
    # Solo normalizamos para la búsqueda de términos
    return text
