// Renders tailored resume / CV / cover letter JSON to PDF using Edge or Chrome's headless printer.
// Usage: node src/render_pdf.mjs <jobId> [outputName]
// Reads data/tailored/<jobId>/{resume,cv,cover}.json and writes <Kind>_<outputName or jobId>.pdf next to them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { lint } from "./lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) { console.error("usage: node src/render_pdf.mjs <jobId> [outputName]"); process.exit(1); }
const label = process.argv[3] || id;
const dir = path.join(ROOT, "data", "tailored", id);

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error("No Edge or Chrome found for PDF printing"); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CSS = `
  @page { size: Letter; margin: 0.6in 0.65in; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 10.5pt; line-height: 1.28; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0; text-align: center; }
  .contact { text-align: center; font-size: 9.5pt; margin: 2px 0 6px; }
  h2 { font-size: 11pt; color: #1F4E79; text-transform: uppercase; border-bottom: 1.5px solid #1F4E79; margin: 10px 0 4px; padding-bottom: 1px; }
  .job { display: flex; justify-content: space-between; margin-top: 6px; break-inside: avoid; }
  .job .dates { font-style: italic; white-space: nowrap; }
  ul { margin: 2px 0 0; padding-left: 18px; } li { margin-bottom: 1.5px; }
  p { margin: 0 0 3px; }
  .letter h1 { text-align: left; font-size: 16pt; } .letter .contact { text-align: left; margin-bottom: 14px; }
  .letter p { margin-bottom: 9px; line-height: 1.35; font-size: 11pt; }
  .letter { padding-top: 0.15in; }
  body.compact { font-size: 10pt; line-height: 1.2; } body.compact h2 { margin: 7px 0 3px; } body.compact .job { margin-top: 4px; } body.compact li { margin-bottom: 1px; }
`;

function resumeHtml(d) {
  const out = [`<h1>${esc(d.name)}</h1><div class="contact">${d.contact.map(esc).join("&nbsp; | &nbsp;")}</div>`];
  if (d.summary) out.push(`<h2>Summary</h2><p>${esc(d.summary)}</p>`);
  if (d.skills?.length) out.push("<h2>Skills</h2>" + d.skills.map((s) => `<p><b>${esc(s.label)}:</b> ${s.items.map(esc).join(", ")}</p>`).join(""));
  out.push("<h2>Experience</h2>");
  for (const e of d.experience) {
    out.push(`<div class="job"><span><b>${esc(e.title)}</b> | ${esc(e.company)}${e.location ? ", " + esc(e.location) : ""}</span><span class="dates">${esc(e.dates)}</span></div>`);
    out.push("<ul>" + e.bullets.map((b) => `<li>${esc(b)}</li>`).join("") + "</ul>");
  }
  if (d.earlier?.length) out.push("<h2>Earlier Experience</h2><ul>" + d.earlier.map((t) => `<li>${esc(t)}</li>`).join("") + "</ul>");
  out.push("<h2>Education</h2>" + d.education.map((t) => `<p>${esc(t)}</p>`).join(""));
  return out.join("\n");
}

function letterHtml(d) {
  return `<div class="letter"><h1>${esc(d.name)}</h1><div class="contact">${d.contact.map(esc).join("&nbsp; | &nbsp;")}</div>
<p>${esc(d.date)}</p><p>${d.recipient.map(esc).join("<br>")}</p><p>${esc(d.greeting)}</p>
${d.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("\n")}<p>${esc(d.closing)}<br>${esc(d.name)}</p></div>`;
}

const NAMES = { resume: "Resume", cv: "CV", cover: "CoverLetter" };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jobagent-"));
for (const kind of Object.keys(NAMES)) {
  const f = path.join(dir, `${kind}.json`);
  if (!fs.existsSync(f)) { console.log(`skip ${kind}: not found`); continue; }
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  lint(d, kind);
  const htmlPath = path.join(tmp, `${kind}.html`);
  fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><title>${NAMES[kind]}</title><style>${CSS}</style><body class="${kind === "resume" ? "compact" : ""}">${kind === "cover" ? letterHtml(d) : resumeHtml(d)}</body>`);
  const out = path.join(dir, `${NAMES[kind]}_${label}.pdf`);
  execFileSync(browser, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${path.join(tmp, "profile")}`, `--print-to-pdf=${out}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 60000 });
  if (!fs.existsSync(out)) throw new Error(`browser did not write ${out}`);
  console.log(`wrote ${out}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
