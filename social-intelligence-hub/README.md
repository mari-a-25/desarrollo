# Social Intelligence Hub — CZFS & CAPEX MVP

> Plataforma de escucha social de inversión $0 para la Corporación Zona Franca Santiago y CAPEX.
> Monitoreo de reputación en tiempo real con análisis de sentimiento para Español Dominicano.

---

## Estructura del Proyecto

```
social-intelligence-hub/
├── frontend/                    # Next.js 15 + shadcn/ui + Recharts
│   ├── app/
│   │   └── page.tsx             # Dashboard principal
│   ├── components/
│   │   ├── KpiCard.tsx          # Tarjetas KPI + Gauge de sentimiento neto
│   │   ├── SentimentChart.tsx   # Gráficos de área, donut, barras
│   │   ├── MentionCard.tsx      # Tarjeta de mención con URL + confianza NLP
│   │   ├── DisambiguationModal.tsx  # Modal de desambiguación CAPEX
│   │   └── SearchBar.tsx        # Buscador + filtros tipo chip
│   └── lib/
│       ├── supabase.ts          # Cliente Supabase + tipos + queries
│       └── utils.ts             # Helpers: sentimiento, fechas, dominicano
│
├── scraper/                     # Python 3.12
│   ├── processors/
│   │   ├── azure_sentiment.py   # Azure AI Language + fallback demo
│   │   └── dominican_lexicon.py # Lexicón Español Dominicano (60+ términos)
│   ├── collectors/
│   │   ├── google_reviews.py    # Playwright scraper para Google Maps
│   │   ├── google_alerts.py     # RSS feeds + noticias dominicanas
│   │   └── reddit_collector.py  # API pública de Reddit
│   └── main.py                  # Orquestador principal
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # 5 tablas + 2 vistas + datos demo
│
└── .github/
    └── workflows/
        └── scraper.yml          # Automatización cada 12 horas
```

---

## Guía de Despliegue (30 minutos)

### Paso 1: Base de datos Supabase (GRATIS)

1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto (seleccionar región: US East para latencia óptima desde RD)
3. Ir a **SQL Editor** y ejecutar el archivo:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
4. Obtener credenciales en **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo para el scraper)

### Paso 2: Azure AI Language (GRATIS)

1. Crear cuenta en [portal.azure.com](https://portal.azure.com)
2. Crear recurso: **AI + Machine Learning → Language Service**
3. Seleccionar capa **F0 (Free)**: 5,000 transacciones/mes
4. Obtener:
   - Endpoint → `AZURE_LANGUAGE_ENDPOINT`
   - Key → `AZURE_LANGUAGE_KEY`

> **Nota**: Sin credenciales Azure, el scraper usa análisis demo basado en heurísticas.
> El sistema funciona en modo demo para el MVP.

### Paso 3: Frontend en Vercel (GRATIS)

```bash
cd frontend
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

npm install
npm run dev        # Desarrollo local: http://localhost:3000
```

Para producción:
1. Subir a GitHub
2. Conectar repositorio en [vercel.com](https://vercel.com)
3. Agregar variables de entorno en Vercel dashboard
4. Deploy automático en cada push

### Paso 4: Scraper con GitHub Actions

1. En GitHub repository: **Settings → Secrets and variables → Actions**
2. Agregar secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AZURE_LANGUAGE_ENDPOINT`
   - `AZURE_LANGUAGE_KEY`
3. El workflow se ejecuta automáticamente cada 12 horas
4. Ejecución manual: **Actions → Social Listening Scraper → Run workflow**

Para prueba local del scraper:
```bash
cd scraper
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env
# Editar .env con credenciales

python main.py          # Ejecutar una vez
python main.py --demo   # Insertar datos de prueba
python main.py --schedule  # Modo 12 horas
```

---

## Funcionalidades MVP

### ✅ Dashboard Ejecutivo (Regla de los 5 segundos)
- **KPIs estratégicos** al tope: Sentimiento Neto (gauge visual), Total Menciones, Distribución
- **Patrón F/Pirámide Invertida**: KPIs → Gráficos → Feed de menciones
- Skeleton loaders para estados de carga
- Última actualización visible en el header

### ✅ Motor de Desambiguación CAPEX
- Detecta automáticamente cuando el término "CAPEX" es ambiguo
- Modal interactivo para elegir: **CAPEX Institución** vs **CAPEX Financiero**
- Usa palabras clave de contexto para clasificación automática
- Filtra resultados según la interpretación seleccionada

### ✅ Feed de Evidencia con Trazabilidad
- Cada mención muestra: Avatar generado, plataforma de origen, texto íntegro
- **Enlace directo** a la publicación original (URL traceable)
- Barra de confianza del análisis NLP
- Estrellas para Google Reviews
- Paginación para grandes volúmenes

### ✅ Análisis de Sentimiento con Sabor Local 🇩🇴
**Términos positivos detectados:**
- `jevi`, `jevy` → excelente calidad
- `nítido`, `nitido` → perfecto
- `vacano`, `bacano` → excelente
- `bien montao/montado` → bien organizado
- `de primera` → primera calidad
- Y 15+ términos más...

**Términos negativos detectados:**
- `en olla` → en problemas
- `dando carpeta` → negligente
- `manganzón` → perezoso
- `arranca'o` → sin recursos
- `prendío` → en caos
- Y 15+ términos más...

> Las detecciones dominicanas tienen **prioridad máxima** sobre Azure AI Language.

### ✅ Fuentes de Datos
| Fuente | Método | Entidades |
|--------|--------|-----------|
| Google Reviews | Playwright | PIVEM, PlaZona, MÉDICA CZFS |
| Reddit | API JSON pública | CZFS, CAPEX, PIVEM |
| Google Alerts | RSS Feed | Todas |
| Noticias dominicanas | RSS (Listín, El Nacional, Diario Libre) | Todas |

---

## Stack Tecnológico (Inversión $0)

| Componente | Herramienta | Capa Gratuita |
|---|---|---|
| Base de datos | Supabase | 500 MB + 50k MAUs |
| NLP / Sentimiento | Azure AI Language F0 | 5,000 transacciones/mes |
| Scraping | Playwright + requests | Ilimitado |
| Frontend | Next.js 15 + Vercel | Ilimitado (proyectos personales) |
| Automatización | GitHub Actions | 2,000 min/mes |
| Gráficos | Recharts | Open source |

---

## Próximos Pasos (Plataforma Enterprise)

1. **Ingesta X/Twitter** via API v2 (Essential: 500k tweets/mes gratis)
2. **Facebook Graph API** para páginas públicas
3. **Alertas automáticas** de crisis (webhook a Slack/Teams)
4. **Integración ERP** con SAP Analytics Cloud / NetSuite
5. **Análisis de temas emergentes** (topic modeling con spaCy)
6. **Reporte PDF ejecutivo** automatizado semanal

---

*Desarrollado para la Corporación Zona Franca Santiago (CZFS) y CAPEX · Santiago, República Dominicana · 2026*
