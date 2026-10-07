---
name: tailor-application
description: Create a tailored resume and CV (.docx) for a passing job in daily_leads.md, built only from Profile/profile.md. Use when the user asks to tailor, prepare or write an application for a specific lead.
---

# Tailor resume and CV for one job

Input: a job id or company name from `daily_leads.md` (ids are in the key under the table). Job data is in `JobAgent/data/jobs.json`.

1. Read `Profile/profile.md` (source of truth), the job entry (title, description, `techNotHeld`, `resumeVersion`), and the closest existing resume in the Resumes folder as a layout/voice reference. Ask the user which existing resume file to base on if unclear. profile.md wins over any resume where they disagree.
2. Obey profile.md "Rules for any document" strictly: one title per job; years of experience, degree and certificate wording exactly as stated there; no invented metrics; no blaming partners; never claim Power BI, Python or any unchecked skill. `[TBD]`/`[CONFIRM]` items count as absent. Tailor by selecting and ordering bullets and keywords the posting uses, not by stretching facts.
3. Write two files in `JobAgent/data/tailored/<id>/`:
   - `resume.json`: one page, about 12-16 bullets total.
   - `cv.json`: fuller, two pages, adds earlier experience and any certificates and more detail.

   Schema for both:

```json
{
  "name": "Your Name",
  "contact": ["City, ST 00000", "(000) 000-0000", "you@example.com"],
  "summary": "2-3 sentences using only facts from profile.md",
  "skills": [{ "label": "BI and visualization", "items": ["Tableau", "Qlik Sense"] }],
  "experience": [
    { "title": "Exact job title from profile.md", "company": "Company", "location": "City, ST", "dates": "April 2026 - Present", "bullets": ["..."] }
  ],
  "earlier": ["cv only"],
  "education": ["Degree, Major, University, Year"]
}
```

   Use the exact titles and dates from profile.md for each role.
4. Run `cd JobAgent && node src/render_docx.mjs <id>`. It lints the rules and writes the .docx files; fix any lint error and re-run.
5. Tell the user: the files' location, which posting keywords were mirrored, any required skill the profile cannot support (do not paper over it), and any claim they should double-check. Do not submit anything anywhere.
