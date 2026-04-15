-- ============================================================
-- Social Intelligence Hub - CZFS & CAPEX
-- Schema inicial para Supabase (PostgreSQL)
-- ============================================================

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: entities
-- Define las entidades monitoreadas (CZFS, CAPEX, PIVEM, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,           -- ej: "capex-institucion", "czfs", "pivem"
  name          TEXT NOT NULL,                  -- ej: "CAPEX Institución"
  category      TEXT NOT NULL,                  -- "educacion" | "industrial" | "comercial"
  keywords      TEXT[] NOT NULL DEFAULT '{}',   -- palabras clave de desambiguación
  anti_keywords TEXT[] NOT NULL DEFAULT '{}',   -- palabras que excluyen esta entidad
  description   TEXT,
  logo_url      TEXT,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: sources
-- Plataformas / fuentes de datos
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT UNIQUE NOT NULL,     -- "google_reviews", "reddit", "google_alerts"
  name        TEXT NOT NULL,
  icon_url    TEXT,
  base_url    TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: mentions
-- Almacena cada mención/comentario recolectado
-- ============================================================
CREATE TABLE IF NOT EXISTS mentions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relaciones
  entity_id         UUID REFERENCES entities(id) ON DELETE SET NULL,
  source_id         UUID REFERENCES sources(id) ON DELETE SET NULL,

  -- Contenido
  text_original     TEXT NOT NULL,
  text_normalized   TEXT,               -- texto limpiado para NLP
  author_name       TEXT,
  author_avatar_url TEXT,
  source_url        TEXT,               -- URL directa a la publicación original
  platform_post_id  TEXT,              -- ID único en la plataforma origen

  -- Calificación (Google Reviews)
  star_rating       SMALLINT CHECK (star_rating BETWEEN 1 AND 5),

  -- Sentimiento (Azure AI Language)
  sentiment_label   TEXT CHECK (sentiment_label IN ('positive','negative','neutral','mixed')),
  sentiment_score   JSONB,             -- {"positive": 0.9, "negative": 0.05, "neutral": 0.05}
  confidence_score  NUMERIC(4,3),

  -- Post-procesamiento dominicano
  dominican_override     BOOLEAN DEFAULT FALSE,
  dominican_term_found   TEXT,          -- ej: "jevi", "en olla"

  -- Metadatos
  published_at      TIMESTAMPTZ,
  collected_at      TIMESTAMPTZ DEFAULT NOW(),
  language          TEXT DEFAULT 'es',
  location_hint     TEXT,               -- ej: "Santiago, RD"
  search_query      TEXT,               -- término de búsqueda usado

  -- Deduplicación
  content_hash      TEXT UNIQUE,        -- SHA256 del texto + fuente para evitar duplicados

  -- Indexación
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: scraper_runs
-- Historial de ejecuciones del scraper
-- ============================================================
CREATE TABLE IF NOT EXISTS scraper_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_slug     TEXT NOT NULL,
  entity_slug     TEXT,
  status          TEXT CHECK (status IN ('running','success','error')),
  mentions_found  INTEGER DEFAULT 0,
  mentions_new    INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

-- ============================================================
-- TABLA: crisis_alerts
-- Alertas automáticas cuando el sentimiento cae drásticamente
-- ============================================================
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id       UUID REFERENCES entities(id),
  alert_type      TEXT,                 -- "sentiment_drop", "volume_spike", "negative_surge"
  severity        TEXT CHECK (severity IN ('low','medium','high','critical')),
  message         TEXT,
  trigger_value   NUMERIC,
  threshold_value NUMERIC,
  acknowledged    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para rendimiento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mentions_entity_id    ON mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_mentions_source_id    ON mentions(source_id);
CREATE INDEX IF NOT EXISTS idx_mentions_sentiment     ON mentions(sentiment_label);
CREATE INDEX IF NOT EXISTS idx_mentions_published_at ON mentions(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_collected_at ON mentions(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_content_hash ON mentions(content_hash);

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_mentions_updated_at
  BEFORE UPDATE ON mentions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VISTAS útiles para el dashboard
-- ============================================================

-- Vista: resumen de sentimiento por entidad (últimos 30 días)
CREATE OR REPLACE VIEW v_sentiment_summary AS
SELECT
  e.slug           AS entity_slug,
  e.name           AS entity_name,
  e.category,
  COUNT(*)         AS total_mentions,
  SUM(CASE WHEN m.sentiment_label = 'positive' THEN 1 ELSE 0 END) AS positive_count,
  SUM(CASE WHEN m.sentiment_label = 'negative' THEN 1 ELSE 0 END) AS negative_count,
  SUM(CASE WHEN m.sentiment_label = 'neutral'  THEN 1 ELSE 0 END) AS neutral_count,
  SUM(CASE WHEN m.sentiment_label = 'mixed'    THEN 1 ELSE 0 END) AS mixed_count,
  ROUND(
    100.0 * SUM(CASE WHEN m.sentiment_label = 'positive' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)
  , 1) AS positive_pct,
  ROUND(
    (
      SUM(CASE WHEN m.sentiment_label = 'positive' THEN 1 ELSE 0 END) -
      SUM(CASE WHEN m.sentiment_label = 'negative' THEN 1 ELSE 0 END)
    )::NUMERIC / NULLIF(COUNT(*), 0) * 100
  , 1) AS net_sentiment_score,
  MAX(m.collected_at) AS last_updated
FROM entities e
LEFT JOIN mentions m ON m.entity_id = e.id
  AND m.published_at >= NOW() - INTERVAL '30 days'
GROUP BY e.id, e.slug, e.name, e.category;

-- Vista: tendencia diaria de menciones (últimos 14 días)
CREATE OR REPLACE VIEW v_daily_trend AS
SELECT
  DATE(m.published_at)   AS mention_date,
  e.slug                 AS entity_slug,
  m.sentiment_label,
  COUNT(*)               AS mention_count
FROM mentions m
JOIN entities e ON e.id = m.entity_id
WHERE m.published_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(m.published_at), e.slug, m.sentiment_label
ORDER BY mention_date DESC;

-- ============================================================
-- DATOS SEMILLA: Entidades
-- ============================================================
INSERT INTO entities (slug, name, category, keywords, anti_keywords, description) VALUES
(
  'czfs',
  'Corporación Zona Franca Santiago',
  'industrial',
  ARRAY['czfs', 'zona franca', 'zona franca santiago', 'parque industrial', 'pivem', 'plazona', 'médica', 'medica', 'corporacion'],
  ARRAY['ciudad', 'parque nacional'],
  'Conglomerado industrial líder en la región norte de República Dominicana'
),
(
  'capex-institucion',
  'CAPEX Institución Educativa',
  'educacion',
  ARRAY['capex', 'capacitacion', 'taller', 'curso', 'egresado', 'egresados', 'formacion', 'tecnico', 'centro capacitacion', 'capex santiago'],
  ARRAY['capital expenditure', 'gastos de capital', 'inversión de capital', 'capex ratio', 'financial', 'finanzas', 'contabilidad'],
  'Centro de Innovación y Capacitación Profesional - brazo educativo de CZFS'
),
(
  'pivem',
  'PIVEM (Parque Industrial)',
  'industrial',
  ARRAY['pivem', 'parque industrial villa europa', 'inquilino', 'empresa parque', 'zona franca'],
  ARRAY[]::TEXT[],
  'Parque Industrial Villa Europa Mediterráneo - Principal activo industrial de CZFS'
),
(
  'plazona',
  'PlaZona',
  'comercial',
  ARRAY['plazona', 'plaza zona franca', 'comercial plazona'],
  ARRAY[]::TEXT[],
  'Centro comercial y de servicios del ecosistema CZFS'
),
(
  'medica-czfs',
  'MÉDICA CZFS',
  'comercial',
  ARRAY['medica czfs', 'médica czfs', 'clinica zona franca', 'clínica zona franca'],
  ARRAY[]::TEXT[],
  'Centro de salud del ecosistema CZFS'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- DATOS SEMILLA: Fuentes
-- ============================================================
INSERT INTO sources (slug, name, base_url) VALUES
('google_reviews', 'Google Reviews',    'https://maps.google.com'),
('reddit',         'Reddit',            'https://reddit.com'),
('google_alerts',  'Google Alerts RSS', 'https://google.com/alerts'),
('twitter_x',      'X (Twitter)',        'https://x.com'),
('facebook',       'Facebook',          'https://facebook.com'),
('news_web',       'Noticias Web',      NULL)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- DATOS DEMO: Menciones de muestra para el MVP
-- ============================================================
WITH
  czfs_id AS (SELECT id FROM entities WHERE slug = 'czfs'),
  capex_id AS (SELECT id FROM entities WHERE slug = 'capex-institucion'),
  pivem_id AS (SELECT id FROM entities WHERE slug = 'pivem'),
  gr_source AS (SELECT id FROM sources WHERE slug = 'google_reviews'),
  reddit_src AS (SELECT id FROM sources WHERE slug = 'reddit')
INSERT INTO mentions (
  entity_id, source_id, text_original, author_name,
  source_url, sentiment_label, sentiment_score, confidence_score,
  star_rating, published_at, content_hash
) VALUES
-- Google Reviews PIVEM - Positivos
(
  (SELECT id FROM czfs_id), (SELECT id FROM gr_source),
  'Excelente parque industrial. Las instalaciones están en perfectas condiciones y el personal de seguridad es muy profesional. Definitivamente un referente en la región norte.',
  'Carlos Rodríguez',
  'https://maps.google.com/?cid=123456789',
  'positive', '{"positive":0.92,"negative":0.03,"neutral":0.05}'::jsonb, 0.92,
  5, NOW() - INTERVAL '2 days',
  md5('google_reviews_czfs_001')
),
(
  (SELECT id FROM czfs_id), (SELECT id FROM gr_source),
  'Jevi el servicio aquí. Llegué a buscar información y me atendieron de primera. Todo está muy bien organizado.',
  'María Sánchez',
  'https://maps.google.com/?cid=123456790',
  'positive', '{"positive":0.88,"negative":0.05,"neutral":0.07}'::jsonb, 0.88,
  5, NOW() - INTERVAL '5 days',
  md5('google_reviews_czfs_002')
),
-- Google Reviews PIVEM - Negativos
(
  (SELECT id FROM czfs_id), (SELECT id FROM gr_source),
  'El parqueo está en olla. No hay suficiente espacio y el acceso vehicular es un caos todas las mañanas.',
  'Juan Pérez',
  'https://maps.google.com/?cid=123456791',
  'negative', '{"positive":0.05,"negative":0.88,"neutral":0.07}'::jsonb, 0.88,
  2, NOW() - INTERVAL '1 day',
  md5('google_reviews_czfs_003')
),
(
  (SELECT id FROM czfs_id), (SELECT id FROM gr_source),
  'Pésima atención al cliente en la recepción. Estuve esperando más de una hora sin que nadie me atendiera. Dando carpeta con el servicio.',
  'Ana Gómez',
  'https://maps.google.com/?cid=123456792',
  'negative', '{"positive":0.04,"negative":0.91,"neutral":0.05}'::jsonb, 0.91,
  1, NOW() - INTERVAL '3 days',
  md5('google_reviews_czfs_004')
),
-- CAPEX - Educación
(
  (SELECT id FROM capex_id), (SELECT id FROM reddit_src),
  'Acabo de terminar el curso de mecatrónica en CAPEX Santiago y quedé impresionado. Los instructores son profesionales con experiencia real en la industria. Los egresados tienen alta empleabilidad.',
  'tecnico_rd',
  'https://reddit.com/r/Dominican/comments/abc123',
  'positive', '{"positive":0.95,"negative":0.02,"neutral":0.03}'::jsonb, 0.95,
  NULL, NOW() - INTERVAL '4 days',
  md5('reddit_capex_001')
),
(
  (SELECT id FROM capex_id), (SELECT id FROM reddit_src),
  'El taller de soldadura en CAPEX es nítido. Aprendí más en 3 meses que en un año de teoría. Vale cada peso.',
  'soldador_cibao',
  'https://reddit.com/r/Dominican/comments/abc124',
  'positive', '{"positive":0.91,"negative":0.03,"neutral":0.06}'::jsonb, 0.91,
  NULL, NOW() - INTERVAL '7 days',
  md5('reddit_capex_002')
),
(
  (SELECT id FROM capex_id), (SELECT id FROM gr_source),
  'Los horarios son muy inflexibles para quienes trabajamos. Necesitan ofrecer más opciones nocturnas para los cursos de tecnología.',
  'trabajador_norte',
  'https://maps.google.com/?cid=123456793',
  'negative', '{"positive":0.10,"negative":0.75,"neutral":0.15}'::jsonb, 0.75,
  3, NOW() - INTERVAL '6 days',
  md5('google_reviews_capex_001')
),
-- Neutros
(
  (SELECT id FROM czfs_id), (SELECT id FROM reddit_src),
  'Alguien sabe los horarios de atención de la Corporación Zona Franca Santiago? Necesito ir a consultar sobre el proceso para instalar una empresa.',
  'emprendedor_stgo',
  'https://reddit.com/r/Dominican/comments/abc125',
  'neutral', '{"positive":0.15,"negative":0.10,"neutral":0.75}'::jsonb, 0.75,
  NULL, NOW() - INTERVAL '8 days',
  md5('reddit_czfs_001')
),
(
  (SELECT id FROM capex_id), (SELECT id FROM reddit_src),
  'CAPEX lanzó nuevos cursos de inteligencia artificial para el 2026. ¿Alguien tiene más información sobre los requisitos de admisión?',
  'futuro_tecnico',
  'https://reddit.com/r/Dominican/comments/abc126',
  'neutral', '{"positive":0.20,"negative":0.05,"neutral":0.75}'::jsonb, 0.75,
  NULL, NOW() - INTERVAL '10 days',
  md5('reddit_capex_003')
)
ON CONFLICT (content_hash) DO NOTHING;

-- Actualizar flag dominicano en las menciones que usan términos locales
UPDATE mentions SET
  dominican_override = TRUE,
  dominican_term_found = 'jevi',
  sentiment_label = 'positive'
WHERE content_hash = md5('google_reviews_czfs_002');

UPDATE mentions SET
  dominican_override = TRUE,
  dominican_term_found = 'en olla',
  sentiment_label = 'negative'
WHERE content_hash = md5('google_reviews_czfs_003');

UPDATE mentions SET
  dominican_override = TRUE,
  dominican_term_found = 'dando carpeta',
  sentiment_label = 'negative'
WHERE content_hash = md5('google_reviews_czfs_004');

UPDATE mentions SET
  dominican_override = TRUE,
  dominican_term_found = 'nitido',
  sentiment_label = 'positive'
WHERE content_hash = md5('reddit_capex_002');
