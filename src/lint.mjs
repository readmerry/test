// Mechanical checks run on every generated resume / CV / cover letter before rendering.
// Add one [regex, message] pair per rule from your own profile (e.g. banned titles, wrong degree wording).
export const RULES = [
  // [/\bsenior\b/i, "claims 'Senior'"],
];

export function lint(doc, label) {
  const text = JSON.stringify(doc);
  const hits = RULES.filter(([r]) => r.test(text)).map(([, m]) => m);
  if (hits.length) throw new Error(`${label}: ${hits.join("; ")}`);
}
