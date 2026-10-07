// Collects job postings from sources that allow automated access, normalizes them,
// pre-filters obvious non-matches, and queues new ones in data/jobs.json for grading.
// Usage: node src/search.mjs [--days N] [--verbose]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const DB_PATH = path.join(ROOT, "data", "jobs.json");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const daysArg = args.indexOf("--days");
const maxAgeDays = daysArg >= 0 ? Number(args[daysArg + 1]) : cfg.maxAgeDays;
// Optional local key file: JobAgent/.env with lines like ADZUNA_APP_ID=abc
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(String.fromCharCode(10))) {
    const eq = line.indexOf("=");
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (eq > 0 && v && !process.env[k]) process.env[k] = v;
  }
}
const UA = { "User-Agent": "personal-job-agent/0.1 (single-user job search)" };

const stripHtml = (s = "") =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function getJson(url, opts = {}) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const job = (o) => ({
  source: o.source, sourceId: String(o.sourceId ?? o.url), company: o.company || "", title: o.title || "",
  location: o.location || "", remote: o.remote ?? null, employmentType: o.employmentType || "",
  salaryMin: o.salaryMin ?? null, salaryMax: o.salaryMax ?? null, url: o.url,
  posted: o.posted ? new Date(o.posted).toISOString() : null,
  description: stripHtml(o.description || "").slice(0, 8000),
});

// ---------- sources ----------
const sources = {
  async remotive() {
    const out = [];
    for (const cat of ["data", "business", "all-others"]) {
      const d = await getJson(`https://remotive.com/api/remote-jobs?category=${cat}&limit=200`).catch(() => null);
      for (const j of d?.jobs ?? []) out.push(job({ source: "remotive", sourceId: j.id, company: j.company_name, title: j.title, location: j.candidate_required_location, remote: true, employmentType: j.job_type, url: j.url, posted: j.publication_date, description: j.description }));
    }
    return out;
  },
  async remoteok() {
    const d = await getJson("https://remoteok.com/api");
    return d.filter((j) => j.id).map((j) => job({ source: "remoteok", sourceId: j.id, company: j.company, title: j.position, location: j.location, remote: true, salaryMin: j.salary_min || null, salaryMax: j.salary_max || null, url: j.url, posted: j.date, description: j.description }));
  },
  async arbeitnow() {
    const out = [];
    for (let p = 1; p <= 3; p++) {
      const d = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${p}`).catch(() => null);
      for (const j of d?.data ?? []) out.push(job({ source: "arbeitnow", sourceId: j.slug, company: j.company_name, title: j.title, location: j.location, remote: j.remote, employmentType: (j.job_types || []).join(","), url: j.url, posted: j.created_at * 1000, description: j.description }));
    }
    return out;
  },
  async himalayas() {
    const out = [];
    for (let off = 0; off < 400; off += 100) {
      const d = await getJson(`https://himalayas.app/jobs/api?limit=100&offset=${off}`).catch(() => null);
      for (const j of d?.jobs ?? []) out.push(job({ source: "himalayas", sourceId: j.guid || j.applicationLink, company: j.companyName, title: j.title, location: (j.locationRestrictions || []).join(", ") || "Worldwide", remote: true, employmentType: j.employmentType, salaryMin: j.minSalary, salaryMax: j.maxSalary, url: j.applicationLink || j.guid, posted: j.pubDate ? j.pubDate * 1000 : null, description: j.description }));
    }
    return out;
  },
  async jobicy() {
    const out = [];
    for (const tag of ["analyst", "data", "supply chain", "business intelligence"]) {
      const d = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`).catch(() => null);
      for (const j of d?.jobs ?? []) out.push(job({ source: "jobicy", sourceId: j.id, company: j.companyName, title: j.jobTitle, location: j.jobGeo, remote: true, employmentType: [].concat(j.jobType || []).join(","), salaryMin: j.annualSalaryMin || j.salaryMin, salaryMax: j.annualSalaryMax || j.salaryMax, url: j.url, posted: j.pubDate, description: j.jobDescription }));
    }
    return out;
  },
  async adzuna() {
    const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = process.env;
    if (!id || !key) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set (skipped)");
    const out = [];
    const a = cfg.sources.adzuna;
    for (const q of cfg.queries) {
      for (const where of [a.where, null]) {
        const qs = new URLSearchParams({ app_id: id, app_key: key, results_per_page: "50", what: where ? q : `${q} remote`, max_days_old: String(maxAgeDays), full_time: "1", "content-type": "application/json" });
        if (where) { qs.set("where", where); qs.set("distance", String(Math.round(a.distanceMiles * 1.609))); }
        const d = await getJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${qs}`).catch(() => null);
        for (const j of d?.results ?? []) out.push(job({ source: "adzuna", sourceId: j.id, company: j.company?.display_name, title: j.title, location: j.location?.display_name, salaryMin: j.salary_min, salaryMax: j.salary_max, employmentType: [j.contract_time, j.contract_type].filter(Boolean).join(","), url: j.redirect_url, posted: j.created, description: j.description }));
      }
    }
    return out;
  },
  async usajobs() {
    const { USAJOBS_API_KEY: key, USAJOBS_EMAIL: email } = process.env;
    if (!key || !email) throw new Error("USAJOBS_API_KEY / USAJOBS_EMAIL not set (skipped)");
    const out = [];
    for (const q of cfg.queries.slice(0, 6)) {
      const d = await getJson(`https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(q)}&LocationName=${encodeURIComponent(cfg.sources.adzuna.where)}&Radius=40&DatePosted=${maxAgeDays}`, { headers: { ...UA, "Authorization-Key": key, "User-Agent": email, Host: "data.usajobs.gov" } }).catch(() => null);
      for (const r of d?.SearchResult?.SearchResultItems ?? []) {
        const j = r.MatchedObjectDescriptor, pay = j.PositionRemuneration?.[0];
        out.push(job({ source: "usajobs", sourceId: r.MatchedObjectId, company: j.OrganizationName, title: j.PositionTitle, location: j.PositionLocationDisplay, salaryMin: Number(pay?.MinimumRange) || null, salaryMax: Number(pay?.MaximumRange) || null, employmentType: j.PositionSchedule?.[0]?.Name, url: j.PositionURI, posted: j.PublicationStartDate, description: j.UserArea?.Details?.JobSummary || j.QualificationSummary }));
      }
    }
    return out;
  },
};

const boards = {
  async greenhouse(token) {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
    return d.jobs.map((j) => job({ source: `greenhouse:${token}`, sourceId: j.id, company: token, title: j.title, location: j.location?.name, url: j.absolute_url, posted: j.first_published || j.updated_at, description: j.content }));
  },
  async lever(token) {
    const d = await getJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
    return d.map((j) => job({ source: `lever:${token}`, sourceId: j.id, company: token, title: j.text, location: j.categories?.location, remote: j.workplaceType === "remote" ? true : null, employmentType: j.categories?.commitment, url: j.hostedUrl, posted: j.createdAt, description: j.descriptionPlain }));
  },
  async ashby(token) {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
    return d.jobs.map((j) => job({ source: `ashby:${token}`, sourceId: j.id, company: token, title: j.title, location: j.location, remote: j.isRemote, employmentType: j.employmentType, url: j.jobUrl, posted: j.publishedAt, description: j.descriptionPlain }));
  },
};

// ---------- pre-filter (cheap; the rubric's hard filters are applied again at grading) ----------
const re = (list) => new RegExp(list.join("|"), "i");
const titleOk = re(cfg.titleMustMatch), titleBad = re(cfg.titleExclude), localRe = re(cfg.localTerms);

function prefilter(j) {
  if (!j.title || !j.url) return "missing fields";
  if (!titleOk.test(j.title)) return "title not relevant";
  if (titleBad.test(j.title)) return "title excluded";
  if (/contract|temporary|part[- ]?time|intern/i.test(j.employmentType) && !/full/i.test(j.employmentType)) return "not full-time";
  if (j.salaryMax && j.salaryMax > 1000 && j.salaryMax < cfg.minSalaryCeiling) return "salary below floor";
  if (j.posted && Date.now() - new Date(j.posted) > maxAgeDays * 864e5) return "too old";
  const loc = `${j.location}`.toLowerCase();
  const remoteish = j.remote || /remote/.test(loc) || /remote/i.test(j.title);
  const us = /united states|usa|\bus\b|americas|north america|worldwide|anywhere/.test(loc) || loc === "" || loc === "remote";
  if (remoteish && !us && !localRe.test(loc)) return "remote outside US";
  if (!remoteish && loc && !localRe.test(loc)) return "location out of range";
  return null;
}

// ---------- run ----------
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, "utf8")) : {};
const tasks = [];
for (const [name, on] of Object.entries(cfg.sources)) {
  if (Array.isArray(on)) for (const tok of on) tasks.push([`${name}:${tok}`, () => boards[name](tok)]);
  else if ((on === true || on?.enabled) && sources[name]) tasks.push([name, sources[name]]);
}

const stats = [];
let added = 0;
for (const [name, fn] of tasks) {
  try {
    const rows = await fn();
    let kept = 0;
    const why = {};
    for (const j of rows) {
      const reason = prefilter(j);
      if (reason) { why[reason] = (why[reason] || 0) + 1; continue; }
      const id = crypto.createHash("sha1").update(`${j.company}|${j.title}|${j.location}`.toLowerCase()).digest("hex").slice(0, 12);
      if (db[id]) continue; // dedupe across sources and across days
      db[id] = { id, status: "new", found: new Date().toISOString().slice(0, 10), ...j };
      kept++; added++;
    }
    stats.push(`${name}: ${rows.length} fetched, ${kept} new${verbose ? " " + JSON.stringify(why) : ""}`);
  } catch (e) {
    stats.push(`${name}: FAILED - ${e.message}`);
  }
}
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));

// Adzuna's API returns a ~500 character snippet. Fetch the full posting text from its public /details page.
// Redirect ("/land/ad") pages are bot-blocked; those jobs are flagged so they are never graded on a snippet.
async function enrichAdzuna() {
  for (const j of Object.values(db)) {
    if (j.status !== "new" || j.source !== "adzuna" || j.fullText !== undefined) continue;
    j.fullText = false;
    if (!j.url.includes("/details/")) continue;
    try {
      const res = await fetch(j.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/<section[^>]*class="[^"]*adp-body[^"]*"[\s\S]*?<\/section>/i);
      if (!m) continue;
      const text = stripHtml(m[0]);
      if (text.length > j.description.length) { j.description = text.slice(0, 8000); j.fullText = true; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
}
await enrichAdzuna();
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));

const pending = Object.values(db).filter((j) => j.status === "new");
fs.writeFileSync(path.join(ROOT, "data", "to_grade.json"), JSON.stringify(pending, null, 1));
console.log(stats.join("\n"));
console.log(`\n${added} new this run; ${pending.length} awaiting grading -> data/to_grade.json`);
for (const p of cfg.careerPages) console.log(`manual check: ${p.company} ${p.url}`);
