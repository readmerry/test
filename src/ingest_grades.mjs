// Validates grades written by the grade-jobs skill against rubric.md's allowed point values,
// recomputes totals and the PASS/FILTERED result, updates data/jobs.json, and rebuilds daily_leads.md.
// Usage: node src/ingest_grades.mjs data/grades.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const DB_PATH = path.join(ROOT, "data", "jobs.json");
const LEADS_PATH = path.join(ROOT, "..", "daily_leads.md");

const ALLOWED = {
  title: [25, 21, 18, 12, 5, 0],
  tech: [25, 20, 14, 8, 0],
  experience: [20, 14, 8, 0],
  location: [15, 8, 4, 0],
  company: [15, 12, 8, 0],
};

const file = process.argv[2] || path.join(ROOT, "data", "grades.json");
const grades = JSON.parse(fs.readFileSync(file, "utf8"));
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const problems = [];

for (const g of grades) {
  const j = db[g.id];
  if (!j) { problems.push(`${g.id}: unknown job id`); continue; }
  if (g.hardFilter) {
    Object.assign(j, { status: "filtered", result: "FILTERED - HARD FILTER", hardFilter: g.hardFilter, score: null });
    continue;
  }
  let bad = false;
  for (const [k, vals] of Object.entries(ALLOWED)) {
    if (!vals.includes(g.scores?.[k])) { problems.push(`${g.id} (${j.title}): ${k}=${g.scores?.[k]} is not an allowed rubric value`); bad = true; }
  }
  if (bad) continue; // leave status "new" so it is re-graded
  const penalty = g.companyPenalty ? 4 : 0; // rubric: subtract 4 (not below 0) from category 5
  const company = Math.max(0, g.scores.company - penalty);
  const total = g.scores.title + g.scores.tech + g.scores.experience + g.scores.location + company;
  Object.assign(j, {
    status: total >= cfg.threshold ? "pass" : "filtered",
    result: total >= cfg.threshold ? "PASS" : "FILTERED",
    score: total, scores: { ...g.scores, company }, evidence: g.evidence || {},
    techNotHeld: g.techNotHeld || [], resumeVersion: g.resumeVersion || null, reason: g.reason || "",
  });
}
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));

const passes = Object.values(db).filter((j) => j.status === "pass").sort((a, b) => b.score - a.score || b.found.localeCompare(a.found));
const esc = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const lines = [
  "# Daily leads",
  "",
  `Jobs scoring ${cfg.threshold}+ against rubric.md. Rebuilt by the agent; do not edit by hand.`,
  "",
  "| Date Found | Company | Job Title | Score | Resume | Application Link | Brief Reason for Match | Tailored |",
  "|---|---|---|---|---|---|---|---|",
  ...passes.map((j) => `| ${j.found} | ${esc(j.company)} | ${esc(j.title)} | ${j.score} | ${j.resumeVersion ?? ""} | [apply](${j.url}) | ${esc(j.reason)} | ${fs.existsSync(path.join(ROOT, "data", "tailored", j.id)) ? "yes" : ""} |`),
  "",
  `ID key for tailoring: ${passes.map((j) => `${j.id}=${esc(j.company)}`).join(", ")}`,
  "",
];
fs.writeFileSync(LEADS_PATH, lines.join("\n"));

const n = (s) => Object.values(db).filter((j) => j.status === s).length;
console.log(`graded ${grades.length}: pass=${n("pass")} filtered=${n("filtered")} still-new=${n("new")}`);
if (problems.length) { console.log("PROBLEMS (those jobs stay queued):\n" + problems.join("\n")); process.exitCode = 1; }
