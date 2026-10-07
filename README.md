# Job agent

Daily loop (run from Claude Code in the Resumes folder): say "run the job search".

1. Copy config.example.json to config.json and edit it first. `node src/search.mjs` collects postings (Remotive, RemoteOK, Arbeitnow, Himalayas, Jobicy; Adzuna and USAJobs once keys are set; any Greenhouse/Lever/Ashby company boards listed in config.json), pre-filters, dedupes into data/jobs.json.
2. `grade-jobs` skill scores each against Profile/rubric.md; `ingest_grades.mjs` enforces allowed point values and writes ../daily_leads.md.
3. `tailor-application` skill writes a resume + CV (.docx) for a lead you pick, built only from Profile/profile.md.

Setup that raises coverage most:
- Free Adzuna keys (developer.adzuna.com): `setx ADZUNA_APP_ID ...` and `setx ADZUNA_APP_KEY ...`. This adds local-area and nationwide remote listings.
- Add company ATS tokens to config.json `sources.greenhouse|lever|ashby` (the slug in boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, jobs.ashbyhq.com/<slug>).

Not scraped: LinkedIn, Indeed, Glassdoor (they block it and prohibit it). Use their email alerts.
