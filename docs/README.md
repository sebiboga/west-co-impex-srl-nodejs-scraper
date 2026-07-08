# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile West Company (WEST CO IMPEX SRL) din România.

Extrage anunțurile de pe [West Company Careers](https://www.westcompany.ro/cariere/) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public cuifirma.ro după CIF-ul West Company (4565806) și verifică:
   - Denumirea oficială: WEST CO IMPEX SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — extrage lista completă de job-uri din pagina de cariere West Company
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în SOLR** — upsert în `job` core (job-urile) și `company` core (datele companiei cu adresa completă)
6. **Generează docs/jobs.md** — fișier markdown cu informații companie + toate job-urile curente, publicat pe [GitHub Pages](https://sebiboga.github.io/west-co-impex-srl-nodejs-scraper/jobs.md)

## Structură proiect

```
├── config/company.json         # Sursa unică de adevăr (CIF, brand, URL-uri, API)
├── config/company.js           # Loader ESM pentru config/company.json
├── index.js                    # Orchestrator principal
├── company.js                  # Validare companie (cuifirma.ro + Peviitor + SOLR) cu cache 7 zile
├── demoanaf.js                 # CLI wrapper pentru src/anaf.js
├── src/anaf.js                 # Modul cuifirma.ro MCP (search + company details)
├── src/markdown-generator.js   # Generează docs/jobs.md după scrape
├── src/job-validator.js        # Primitivă comună: validateByHead, validateByContent
├── solr.js                     # Operații SOLR (query, upsert, delete, company)
├── company.json                # Cache cuifirma.ro (committed, TTL 7 zile, fallback la stale)
├── ROBOTS.md          # Analiză robots.txt și politici de scraping
├── tests/
│   ├── unit/          # Teste unitare (API-uri mock-uite)
│   ├── integration/   # Teste de integrare (ANAF + SOLR live)
│   └── e2e/           # Teste end-to-end (pipelin complet)
└── .github/workflows/
    ├── job-seeker-ro-spider.yml     # Rulează zilnic la 6 AM UTC
    └── automation-testing.yml       # Teste automate la fiecare push/PR
```

## API-uri folosite

| API | URL | Autentificare |
| --- | --- | --- |
| West Company Careers | `https://www.westcompany.ro/cariere/` | Public |
| cuifirma.ro MCP | `https://cuifirma.ro/mcp/cuifirma` | Public (30 req/min/IP) |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |
| SOLR (job core) | `https://solr.peviitor.ro/solr/job` | `SOLR_AUTH` |
| SOLR (company core) | `https://solr.peviitor.ro/solr/company` | `SOLR_AUTH` |

## Robots.txt

West Company [robots.txt](https://www.westcompany.ro/robots.txt) dezactivează:

- `/wp-admin/` — zona administrativă WordPress

Scraper-ul folosește rate limiting (1s delay, fără concurență) și un singur User-Agent identificabil.

Pentru analiza completă, vezi [ROBOTS.md](../ROBOTS.md).

## 🌱 Derived Scrapers

Acest scraper este derivat dintr-un template al ecosistemului peviitor.ro.

Derived scrapers care folosesc același template:

| Repo | Companie | CIF | Metodă | Status |
| ------ | ---------- | ----- | -------- | -------- |
| [mejix-srl-nodejs-scraper](https://github.com/sebiboga/mejix-srl-nodejs-scraper) | MEJIX SRL | 17372688 | HTML scraping (cheerio) | ✅ Live |
| [talent-matchmakers-srl-nodejs-scraper](https://github.com/sebiboga/talent-matchmakers-srl-nodejs-scraper) | TALENT MATCHMAKERS S.R.L. | 38460545 | Teamtailor HTML (cheerio) | ✅ Live |
| [principal33-srl-nodejs-scraper](https://github.com/sebiboga/principal33-srl-nodejs-scraper) | PRINCIPAL33 S.R.L. (Personio JSON API) | 35442109 | Personio JSON API | ✅ Live |

**Pitfall #12 — ANOFM job scraping by CIF:** API-ul public ANOFM (`/api/entity/vw_public_job_posting`) oferă job-uri gratis filtrate pe CIF. Adăugați `searchANOFM(cif)` în scraper pentru a nu pierde job-uri de pe această platformă. Location se returnează ca array (`[loc]`).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, SOLR conditional)
npm run test:integration

# Doar E2E (API real West Company + ANAF + SOLR)
npm run test:e2e
```

Testele SOLR folosesc `itIfSolr` — se auto-skip dacă variabila `SOLR_AUTH` nu e setată.
