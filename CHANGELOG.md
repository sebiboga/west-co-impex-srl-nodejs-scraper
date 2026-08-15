# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-15

### Added
- Initial release — derived from [EPAM template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper) (v1.5.0)
- HTML scraping for WEST CO IMPEX SRL (CIF 4565806) at https://www.westcompany.ro/cariere/
- Careers page parsing (`h2`/`h3` titles), URL suffix from job slug
- Location extraction from title (Crișeni, Sălaj) with `normalizeLocation` aliases
- ANOFM API integration (`https://mediere.anofm.ro/api/entity/vw_public_job_posting`) filtered by CIF
- Default location `Crișeni, Sălaj`, default workmode `on-site`
- All template features inherited: `config/company.json` single source of truth, 7-day ANAF cache, `docs/jobs.md` generation, 4-layer test suite, daily scheduled scraping, GitHub Pages dashboard

## License

Copyright (c) 2026 BOGA SEBASTIAN-NICOLAE
Licensed under MIT License
