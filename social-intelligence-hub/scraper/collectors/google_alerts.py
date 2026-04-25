"""
Colector de Google Alerts (RSS Feed) + Google News RSS
Monitorea menciones públicas de CZFS y CAPEX en la web.
"""

import hashlib
import logging
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote_plus, unquote

logger = logging.getLogger(__name__)

try:
    import feedparser
    FEEDPARSER_AVAILABLE = True
except ImportError:
    FEEDPARSER_AVAILABLE = False
    logger.warning("feedparser no instalado. pip install feedparser")

# Configuración de alertas por entidad
# Para crear alertas: https://www.google.com/alerts
# Exportar como RSS Feed y copiar la URL aquí
ALERT_FEEDS = {
    "czfs": [
        # Reemplazar con URLs RSS reales de Google Alerts
        "https://www.google.com/alerts/feeds/USERID/ALERTID_CZFS",
        "https://www.google.com/alerts/feeds/USERID/ALERTID_ZONAFRANCA",
    ],
    "capex-institucion": [
        "https://www.google.com/alerts/feeds/USERID/ALERTID_CAPEX_SANTIAGO",
    ],
    "pivem": [
        "https://www.google.com/alerts/feeds/USERID/ALERTID_PIVEM",
    ],
}

# Fuentes RSS alternativas públicas (noticias dominicanas)
PUBLIC_RSS_FEEDS = {
    "noticias-rd": [
        "https://elnacional.com.do/feed/",
        "https://listindiario.com/feed",
        "https://www.diariolibre.com/feed",
        "https://hoy.com.do/feed/",
        "https://elcaribe.com.do/feed/",
        "https://www.elmasacre.com/feed/",
    ]
}

# Términos de búsqueda por entidad (para filtrar resultados de RSS públicos)
# "phrases" require an exact match; "keywords" are individual tokens
# that count toward the 2-keyword minimum.
SEARCH_TERMS = {
    "czfs": {
        "phrases": ["zona franca santiago", "corporacion zona franca", "corporación zona franca"],
        "keywords": ["czfs", "zona franca", "pivem", "corporacion", "corporación", "santiago"],
    },
    "capex-institucion": {
        "phrases": ["capex santiago", "capex capacitacion", "capex capacitación", "capex formacion", "capex formación", "centro capacitacion santiago"],
        "keywords": ["capex", "capacitacion", "capacitación", "formacion", "formación", "santiago", "egresado", "taller", "curso"],
    },
    "pivem": {
        "phrases": ["parque industrial villa europa", "villa europa mediterraneo", "villa europa mediterráneo"],
        "keywords": ["pivem", "parque industrial", "villa europa", "mediterraneo", "mediterráneo"],
    },
    "plazona": {
        "phrases": ["plazona santiago", "centro comercial plazona"],
        "keywords": ["plazona", "centro comercial", "santiago"],
    },
    "medica-czfs": {
        "phrases": ["medica czfs", "centro de salud czfs"],
        "keywords": ["medica", "czfs", "salud", "zona franca"],
    },
}

# Google News search queries per entity (used by collect_from_google_news)
GOOGLE_NEWS_QUERIES = {
    "czfs": [
        "Corporación Zona Franca Santiago",
        "CZFS Santiago",
    ],
    "capex-institucion": [
        "CAPEX Santiago capacitación",
        "CAPEX centro educativo Santiago",
    ],
    "pivem": [
        "PIVEM parque industrial Santiago",
    ],
    "plazona": [
        "Plazona Santiago",
    ],
    "medica-czfs": [
        "centro médico zona franca Santiago",
    ],
}

# ── Language detection word lists ────────────────────────────────────────────
_ENGLISH_MARKERS = frozenset([
    "the", "and", "with", "for", "that", "this", "from", "have", "has",
    "been", "were", "was", "are", "will", "would", "could", "should",
    "their", "which", "about", "into", "more", "than", "also", "other",
])
_SPANISH_MARKERS = frozenset([
    "que", "del", "los", "las", "una", "con", "por", "para", "como",
    "más", "pero", "sus", "fue", "ser", "está", "son", "hay", "este",
    "esta", "entre", "cuando", "todo", "desde", "sobre", "también",
    "nuevo", "nueva", "otros", "según",
])


def detect_language(text: str) -> str:
    """
    Simple heuristic language detection based on marker-word frequency.
    Returns 'en' or 'es' (defaults to 'es' on a tie since the project
    focuses on Dominican sources).
    """
    words = set(re.findall(r"[a-záéíóúñü]+", text.lower()))
    en_hits = len(words & _ENGLISH_MARKERS)
    es_hits = len(words & _SPANISH_MARKERS)
    return "en" if en_hits > es_hits else "es"


def _is_relevant(text: str, entity_slug: str) -> bool:
    """
    Stricter relevance check: requires at least ONE exact phrase match
    OR at least TWO individual keyword matches.
    """
    terms = SEARCH_TERMS.get(entity_slug)
    if not terms:
        return False

    combined = text.lower()

    # Check exact phrases first — one match is enough
    for phrase in terms.get("phrases", []):
        if phrase in combined:
            return True

    # Otherwise require >= 2 keyword hits
    keyword_hits = sum(1 for kw in terms.get("keywords", []) if kw in combined)
    return keyword_hits >= 2


class GoogleAlertsCollector:
    """
    Colector de menciones vía Google Alerts RSS, Google News RSS,
    y fuentes de noticias públicas dominicanas.
    """

    def __init__(self, sentiment_analyzer=None):
        self.analyzer = sentiment_analyzer

    # ── High-level entry points ──────────────────────────────────────────

    def collect_all(self) -> list[dict]:
        """Recolecta de todos los feeds configurados."""
        all_mentions = []
        for entity_slug, feeds in ALERT_FEEDS.items():
            for feed_url in feeds:
                mentions = self.collect_from_feed(feed_url, entity_slug)
                all_mentions.extend(mentions)
        return all_mentions

    # ── Google Alerts RSS ────────────────────────────────────────────────

    def collect_from_feed(
        self, feed_url: str, entity_slug: str, max_items: int = 50
    ) -> list[dict]:
        """
        Recolecta items de un feed RSS de Google Alerts.
        """
        if not FEEDPARSER_AVAILABLE:
            logger.error("feedparser no disponible")
            return []

        if "USERID" in feed_url or "ALERTID" in feed_url:
            logger.info(f"Feed no configurado para {entity_slug}, saltando...")
            return self._get_demo_news_mentions(entity_slug)

        mentions = []
        try:
            logger.info(f"Leyendo feed: {feed_url}")
            feed = feedparser.parse(feed_url)

            for entry in feed.entries[:max_items]:
                mention = self._parse_feed_entry(entry, entity_slug)
                if mention:
                    mentions.append(mention)

            logger.info(f"Obtenidas {len(mentions)} menciones de {feed_url}")

        except Exception as e:
            logger.error(f"Error leyendo feed {feed_url}: {e}")

        return mentions

    # ── Dominican newspaper RSS (stricter filtering) ─────────────────────

    def collect_from_news_rss(self, entity_slug: str) -> list[dict]:
        """
        Recolecta noticias de feeds RSS públicos de medios dominicanos.
        Uses strict relevance filtering: requires at least one exact
        phrase match OR two keyword matches for the entity.
        """
        if not FEEDPARSER_AVAILABLE:
            return []

        if entity_slug not in SEARCH_TERMS:
            return []

        mentions = []
        for feed_url in PUBLIC_RSS_FEEDS.get("noticias-rd", []):
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:100]:
                    title = entry.get("title", "")
                    summary = entry.get("summary", "")
                    combined = f"{title} {summary}"

                    if _is_relevant(combined, entity_slug):
                        mention = self._parse_feed_entry(
                            entry, entity_slug, source_slug="news_web"
                        )
                        if mention:
                            mentions.append(mention)

            except Exception as e:
                logger.error(f"Error leyendo {feed_url}: {e}")

        return mentions

    # ── Google News RSS (FREE, no API key) ───────────────────────────────

    def collect_from_google_news(
        self,
        entity_slug: str,
        search_query: Optional[str] = None,
        max_items: int = 50,
    ) -> list[dict]:
        """
        Fetch results from Google News RSS.

        URL format:
            https://news.google.com/rss/search?q={query}+site:do&hl=es-419&gl=DO&ceid=DO:es-419

        Parameters
        ----------
        entity_slug : str
            The entity being monitored. Used to pick default queries from
            GOOGLE_NEWS_QUERIES and to apply relevance filtering.
        search_query : str | None
            An arbitrary search string (e.g. from a frontend search bar).
            When provided, *only* this query is executed (the default
            entity queries are skipped).
        max_items : int
            Maximum items to pull per individual RSS feed.

        Returns
        -------
        list[dict]
            Mention dicts ready to be inserted into Supabase.
        """
        if not FEEDPARSER_AVAILABLE:
            logger.error("feedparser no disponible")
            return []

        # Build the list of queries to execute
        if search_query:
            queries = [search_query]
        else:
            queries = GOOGLE_NEWS_QUERIES.get(entity_slug, [])
            if not queries:
                logger.warning(
                    f"No hay queries de Google News configuradas para {entity_slug}"
                )
                return []

        seen_urls: set[str] = set()
        mentions: list[dict] = []

        for query in queries:
            encoded = quote_plus(query)
            url = (
                f"https://news.google.com/rss/search?"
                f"q={encoded}+site:do&hl=es-419&gl=DO&ceid=DO:es-419"
            )

            try:
                logger.info(f"Google News RSS: {query}")
                feed = feedparser.parse(url)

                for entry in feed.entries[:max_items]:
                    link = entry.get("link", "")
                    if link in seen_urls:
                        continue
                    seen_urls.add(link)

                    # Apply the same relevance filter used by news RSS
                    title = entry.get("title", "")
                    summary = entry.get("summary", "")
                    combined = f"{title} {summary}"

                    if not _is_relevant(combined, entity_slug):
                        continue

                    mention = self._parse_feed_entry(
                        entry, entity_slug, source_slug="google_news"
                    )
                    if mention:
                        mentions.append(mention)

                logger.info(
                    f"Google News: {len(mentions)} menciones relevantes para '{query}'"
                )

            except Exception as e:
                logger.error(f"Error leyendo Google News para '{query}': {e}")

        return mentions

    # ── Internal helpers ─────────────────────────────────────────────────

    def _parse_feed_entry(
        self, entry, entity_slug: str, source_slug: str = "google_alerts"
    ) -> Optional[dict]:
        """Parsea una entrada de feed RSS."""
        try:
            title = entry.get("title", "")
            summary = entry.get("summary", "")

            # Limpiar HTML del summary
            text = self._clean_html(summary or title)
            if not text or len(text.strip()) < 20:
                return None

            # URL original
            source_url = entry.get("link", "")
            # Google Alerts wrappea la URL, extraer la real
            source_url = self._extract_real_url(source_url)

            # Fecha de publicación
            published = entry.get("published_parsed")
            if published:
                published_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            else:
                published_at = datetime.now(timezone.utc).isoformat()

            # Author
            author = entry.get("author", "Fuente de noticias")

            # Hash para deduplicación
            content_hash = hashlib.sha256(
                f"{source_slug}:{entity_slug}:{source_url}:{text[:80]}".encode()
            ).hexdigest()

            # Sentimiento
            sentiment_result = {"label": "neutral", "scores": {}, "confidence": 0.5,
                                "dominican_override": False, "dominican_term": None}
            if self.analyzer:
                sentiment_result = self.analyzer.analyze(text)

            # Language detection
            language = detect_language(text)

            return {
                "entity_slug": entity_slug,
                "source_slug": source_slug,
                "text_original": text.strip()[:2000],
                "author_name": author,
                "source_url": source_url,
                "star_rating": None,
                "sentiment_label": sentiment_result["label"],
                "sentiment_score": sentiment_result["scores"],
                "confidence_score": sentiment_result["confidence"],
                "dominican_override": sentiment_result.get("dominican_override", False),
                "dominican_term_found": sentiment_result.get("dominican_term"),
                "published_at": published_at,
                "language": language,
                "location_hint": "República Dominicana",
                "content_hash": content_hash,
            }

        except Exception as e:
            logger.debug(f"Error parseando entrada: {e}")
            return None

    def _clean_html(self, html_text: str) -> str:
        """Elimina etiquetas HTML del texto."""
        clean = re.sub(r'<[^>]+>', ' ', html_text)
        clean = re.sub(r'\s+', ' ', clean)
        return clean.strip()

    def _extract_real_url(self, google_alerts_url: str) -> str:
        """
        Google Alerts wrappea las URLs. Extrae la URL real.
        Formato: https://www.google.com/url?q=REAL_URL&...
        """
        if "google.com/url?q=" in google_alerts_url:
            match = re.search(r'\?q=([^&]+)', google_alerts_url)
            if match:
                return unquote(match.group(1))
        return google_alerts_url

    def _get_demo_news_mentions(self, entity_slug: str) -> list[dict]:
        """Datos demo para cuando los feeds no están configurados."""
        demo_items = {
            "czfs": [
                {
                    "text": "La Corporación Zona Franca Santiago anuncia expansión de sus instalaciones industriales para 2026, generando 500 nuevos empleos en la región norte.",
                    "author": "El Nacional",
                    "url": "https://elnacional.com.do/czfs-expansion-2026",
                    "sentiment": "positive",
                    "days_ago": 2,
                },
                {
                    "text": "CZFS presenta nuevo programa de responsabilidad social empresarial enfocado en comunidades aledañas al PIVEM.",
                    "author": "Listín Diario",
                    "url": "https://listindiario.com/czfs-rse",
                    "sentiment": "positive",
                    "days_ago": 8,
                },
            ],
            "capex-institucion": [
                {
                    "text": "CAPEX Santiago graduó a 200 técnicos en mecatrónica y automatización industrial, respondiendo a la demanda del sector manufacturero.",
                    "author": "Diario Libre",
                    "url": "https://diariolibre.com/capex-graduacion-2026",
                    "sentiment": "positive",
                    "days_ago": 5,
                },
                {
                    "text": "Nuevos cursos de inteligencia artificial y ciberseguridad en CAPEX Santiago buscan cubrir brechas de habilidades digitales en el Cibao.",
                    "author": "El Caribe",
                    "url": "https://elcaribe.com.do/capex-ia-cursos",
                    "sentiment": "positive",
                    "days_ago": 14,
                },
            ],
            "pivem": [
                {
                    "text": "El Parque Industrial Villa Europa Mediterráneo (PIVEM) reporta ocupación récord con nuevas empresas tecnológicas instalándose en sus naves.",
                    "author": "El Nacional",
                    "url": "https://elnacional.com.do/pivem-ocupacion-record",
                    "sentiment": "positive",
                    "days_ago": 3,
                },
            ],
            "plazona": [
                {
                    "text": "Plazona Santiago inaugura nueva área de entretenimiento familiar con cines y espacios recreativos modernos.",
                    "author": "Listín Diario",
                    "url": "https://listindiario.com/plazona-inauguracion",
                    "sentiment": "positive",
                    "days_ago": 11,
                },
            ],
            "medica-czfs": [
                {
                    "text": "El centro médico de la Zona Franca Santiago amplía sus servicios de salud ocupacional para empleados del parque industrial.",
                    "author": "Diario Libre",
                    "url": "https://diariolibre.com/medica-czfs-ampliacion",
                    "sentiment": "positive",
                    "days_ago": 19,
                },
            ],
        }

        items = demo_items.get(entity_slug, [])
        mentions = []

        now = datetime.now(timezone.utc)

        for item in items:
            content_hash = hashlib.sha256(
                f"demo:news:{entity_slug}:{item['url']}".encode()
            ).hexdigest()

            sentiment_result = {"label": item["sentiment"],
                               "scores": {"positive": 0.85, "negative": 0.05, "neutral": 0.10},
                               "confidence": 0.85, "dominican_override": False, "dominican_term": None}
            if self.analyzer:
                sentiment_result = self.analyzer.analyze(item["text"])

            # Spread demo dates realistically across the last 30 days
            days_ago = item.get("days_ago", random.randint(1, 30))
            hours_offset = random.randint(0, 12)
            published_at = (now - timedelta(days=days_ago, hours=hours_offset)).isoformat()

            language = detect_language(item["text"])

            mentions.append({
                "entity_slug": entity_slug,
                "source_slug": "news_web",
                "text_original": item["text"],
                "author_name": item["author"],
                "source_url": item["url"],
                "star_rating": None,
                "sentiment_label": sentiment_result["label"],
                "sentiment_score": sentiment_result["scores"],
                "confidence_score": sentiment_result["confidence"],
                "dominican_override": sentiment_result.get("dominican_override", False),
                "dominican_term_found": sentiment_result.get("dominican_term"),
                "published_at": published_at,
                "language": language,
                "location_hint": "República Dominicana",
                "content_hash": content_hash,
            })

        return mentions
