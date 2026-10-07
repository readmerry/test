// Renders tailored resume / CV JSON into .docx after checking profile.md's document rules.
// Usage: node src/render_docx.mjs <jobId>   (reads data/tailored/<jobId>/resume.json and cv.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, LevelFormat } from "docx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) { console.error("usage: node src/render_docx.mjs <jobId>"); process.exit(1); }
const dir = path.join(ROOT, "data", "tailored", id);

import { lint } from "./lint.mjs";

const FONT = "Calibri", BLUE = "1F4E79";
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: 21, ...o });
const heading = (t) => new Paragraph({ spacing: { before: 180, after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } }, children: [run(t.toUpperCase(), { bold: true, color: BLUE, size: 22 })] });
const bullet = (t) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 30 }, children: [run(t)] });

function build(d) {
  const kids = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(d.name, { bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(d.contact.join("  |  "), { size: 19 })] }),
  ];
  if (d.summary) kids.push(heading("Summary"), new Paragraph({ children: [run(d.summary)] }));
  if (d.skills?.length) {
    kids.push(heading("Skills"));
    for (const s of d.skills) kids.push(new Paragraph({ spacing: { after: 30 }, children: [run(`${s.label}: `, { bold: true }), run(s.items.join(", "))] }));
  }
  kids.push(heading("Experience"));
  for (const e of d.experience) {
    kids.push(new Paragraph({ spacing: { before: 100, after: 20 }, tabStops: [{ type: "right", position: 10080 }], children: [run(e.title, { bold: true }), run(`  |  ${e.company}${e.location ? ", " + e.location : ""}`), run(`\t${e.dates}`, { italics: true })] }));
    e.bullets.forEach((b) => kids.push(bullet(b)));
  }
  if (d.earlier?.length) { kids.push(heading("Earlier Experience")); d.earlier.forEach((t) => kids.push(bullet(t))); }
  kids.push(heading("Education"));
  d.education.forEach((t) => kids.push(new Paragraph({ spacing: { after: 30 }, children: [run(t)] })));
  return new Document({
    numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 } } }, children: kids }],
  });
}

// cover.json: { name, contact[], date, recipient[], greeting, paragraphs[], closing }
function buildLetter(d) {
  const gap = { after: 160 };
  const kids = [
    new Paragraph({ children: [run(d.name, { bold: true, size: 32 })] }),
    new Paragraph({ spacing: { after: 240 }, children: [run(d.contact.join("  |  "), { size: 19 })] }),
    new Paragraph({ spacing: gap, children: [run(d.date)] }),
    ...d.recipient.map((t, i) => new Paragraph({ spacing: { after: i === d.recipient.length - 1 ? 240 : 0 }, children: [run(t)] })),
    new Paragraph({ spacing: gap, children: [run(d.greeting)] }),
    ...d.paragraphs.map((t) => new Paragraph({ spacing: gap, children: [run(t)] })),
    new Paragraph({ spacing: { after: 0 }, children: [run(d.closing)] }),
    new Paragraph({ children: [run(d.name)] }),
  ];
  return new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } }, children: kids }] });
}

const NAMES = { resume: "Resume", cv: "CV", cover: "CoverLetter" };
for (const kind of ["resume", "cv", "cover"]) {
  const f = path.join(dir, `${kind}.json`);
  if (!fs.existsSync(f)) { console.log(`skip ${kind}: ${f} not found`); continue; }
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  lint(d, kind);
  const out = path.join(dir, `${NAMES[kind]}_${id}.docx`);
  fs.writeFileSync(out, await Packer.toBuffer(kind === "cover" ? buildLetter(d) : build(d)));
  console.log(`wrote ${out}`);
}
