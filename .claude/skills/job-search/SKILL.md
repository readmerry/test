---
name: job-search
description: Run the full daily job-search loop for the user - collect new postings, grade them against Profile/rubric.md, and list the passes in daily_leads.md. Use when the user says "run the job search", "find me jobs", or "daily search".
---

# Daily job search

Working folder: the Resumes folder (contains `Profile/`, `JobAgent/`, `daily_leads.md`).

1. Run `cd JobAgent && node src/search.mjs`. Report each source's line (fetched / new / FAILED). If a source failed, say so; do not hide it.
2. If `data/to_grade.json` is empty, stop and say nothing new was found.
3. Invoke the `grade-jobs` skill to grade everything in `data/to_grade.json`.
4. Show the user the top passes from `daily_leads.md` (company, title, score, one-line reason) and the count filtered.
5. Offer to run `tailor-application` for any of them. Never tailor or apply without being asked.

Coverage notes to repeat when relevant:
- LinkedIn, Indeed and Glassdoor block automated access and forbid it in their terms, so they are not scraped. Adzuna aggregates many of the same postings; email alerts from those sites are the manual complement.
