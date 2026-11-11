/**
 * Fails any post that states a number not found in its report JSON or a linked registry event,
 * or that is missing what every post must carry.
 *   node tools/check-post.ts <bundle-dir>... [--registry snapshot.json]
 *   node tools/check-post.ts --all posts [--registry snapshot.json]
 * With --registry, a snapshot.json.sig next to it must verify against registry-public.pem.
 */
import { createPublicKey, verify } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/** Every character with a meaning in a regular expression, escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const POST_TYPES = ["notice", "swap", "fit", "monthly"] as const;
const REQUIRED_FILES = ["post.md", "report.json", "hero.png", "meta.json"];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

interface Registry {
  events: Array<{ id: string }>;
}

/** Every number and digit-bearing string a post may state. */
function evidence(values: unknown[]): { numbers: Set<string>; strings: string[] } {
  const numbers = new Set<string>();
  const strings: string[] = [];
  const addNumber = (n: number) => {
    for (const d of [0, 1, 2, 3]) numbers.add(stripZeros(n.toFixed(d)));
    numbers.add(stripZeros(String(n)));
    // Shares are stored as fractions and written as percentages.
    if (Math.abs(n) <= 1) for (const d of [0, 1]) numbers.add(`${stripZeros((n * 100).toFixed(d))}%`);
  };
  const walk = (v: unknown, key = "") => {
    if (typeof v === "number") {
      addNumber(v);
      // Fields named *_pct already hold percentages.
      if (/pct$/.test(key)) numbers.add(`${stripZeros(String(v))}%`);
    }
    else if (typeof v === "string") {
      strings.push(v.toLowerCase());
      // Digits inside strings (IDs, timestamps) count only as written, never rounded.
      for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) numbers.add(stripZeros(m[0]));
      const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (date) {
        numbers.add(String(Number(date[2])));
        numbers.add(String(Number(date[3])));
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => (strings.push(k.toLowerCase()), walk(x, k)));
  };
  values.forEach((v) => walk(v));
  return { numbers, strings };
}

function stripZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Removes link targets, list markers and table rules, which are structure rather than claims. */
function claimText(md: string): string {
  return md
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/^\|?\s*-{3,}.*$/gm, "");
}

function percentOf(token: string): string {
  return token.endsWith("%") ? `${stripZeros(String(Number(token.replace(/[+%]/g, ""))))}%` : stripZeros(String(Number(token)));
}

export function checkPost(dir: string, registry?: Registry): string[] {
  const problems: string[] = [];
  for (const f of REQUIRED_FILES) if (!existsSync(join(dir, f))) problems.push(`${f} is missing.`);
  if (problems.length) return problems;

  const md = readFileSync(join(dir, "post.md"), "utf8");
  let report: Record<string, unknown>;
  let meta: Record<string, unknown>;
  try {
    report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
    meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  } catch {
    return ["report.json and meta.json must be valid JSON."];
  }
  if (!readFileSync(join(dir, "hero.png")).subarray(0, 8).equals(PNG_SIGNATURE)) problems.push("hero.png is not a PNG.");

  for (const field of ["title", "slug", "excerpt", "tag", "type"]) {
    if (typeof meta[field] !== "string" || !(meta[field] as string).trim()) problems.push(`meta.json needs a non-empty ${field}.`);
  }
  if (!POST_TYPES.includes(meta.type as (typeof POST_TYPES)[number])) problems.push(`meta.json type must be one of ${POST_TYPES.join(", ")}.`);
  if (meta.slug !== basename(dir)) problems.push("meta.json slug must match the bundle directory name.");

  const linked = Array.isArray(meta.registry_events) ? (meta.registry_events as string[]) : [];
  const linkedEvents: unknown[] = [];
  for (const id of linked) {
    const fromReport = JSON.stringify(report).includes(`"id":"${id}"`) || JSON.stringify(report).includes(`"id": "${id}"`);
    const fromRegistry = registry?.events.find((e) => e.id === id);
    if (fromRegistry) linkedEvents.push(fromRegistry);
    else if (!fromReport) problems.push(`linked registry event ${id} is not in report.json and no registry was given to resolve it.`);
  }

  const { numbers, strings } = evidence([report, ...linkedEvents]);
  const text = `${claimText(md)}\n${meta.title}\n${meta.excerpt}`;
  const unknownNumbers = new Set<string>();
  const unknownIds = new Set<string>();
  // Order matters: dates and timestamps are one claim, then identifiers, then bare numbers.
  const TOKEN = /\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?|[A-Za-z_][\w.\-/:@]*\d[\w.\-/:@]*|(?<![\w.])[+-]?\$?\d[\d,]*(?:\.\d+)?%?/g;
  for (const m of text.matchAll(TOKEN)) {
    const token = m[0].replace(/[.,:;]+$/, "");
    if (/^\d{4}-\d{2}-\d{2}/.test(token)) {
      if (!strings.some((s) => s.includes(token.toLowerCase()))) unknownNumbers.add(token);
      continue;
    }
    if (/^[A-Za-z_]/.test(token)) {
      // An identifier with digits, such as a model ID, must appear in the evidence.
      if (!strings.some((s) => s.includes(token.toLowerCase()))) unknownIds.add(token);
      continue;
    }
    const plain = token.replace(/[$,]/g, "");
    if (!numbers.has(percentOf(plain))) unknownNumbers.add(token);
  }
  if (unknownNumbers.size) problems.push(`numbers not found in report.json or a linked event: ${[...unknownNumbers].join(", ")}`);
  if (unknownIds.size) problems.push(`identifiers not found in report.json or a linked event: ${[...unknownIds].join(", ")}`);

  const version = typeof report.swapcheck_version === "string" ? report.swapcheck_version : null;
  if (!version) problems.push("report.json needs swapcheck_version.");
  else if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) problems.push(`report.json swapcheck_version must look like 0.1.3, not ${JSON.stringify(version)}.`);
  else if (!new RegExp(`Swapcheck v?${escapeRegExp(version)}\\b`).test(md)) problems.push(`the post must state the version as "Swapcheck ${version}".`);

  const runs = typeof report.runs === "number" ? report.runs : typeof report.runs_per_case === "number" ? report.runs_per_case : null;
  if (runs === null) problems.push("report.json needs runs or runs_per_case.");
  else if (!new RegExp(`\\bRuns?(?: per case)?: ${runs}\\b|\\b${runs} runs?\\b`, "i").test(md)) problems.push(`the post must state the run count (${runs}).`);

  const date = typeof report.date === "string" ? report.date : typeof report.created_at === "string" ? report.created_at.slice(0, 10) : null;
  if (!date) problems.push("report.json needs a date or created_at.");
  else if (!md.includes(date) && !md.toLowerCase().includes(longDate(date))) problems.push(`the post must state its date (${date}).`);

  const limits = /^## Limits\s*\n+((?:- .+\n?)+)/m.exec(md);
  if (!limits) problems.push("the post needs a '## Limits' section with at least one bullet.");
  if (!/\]\((?:\.\/)?report\.json\)|\]\(https:\/\/\S+\/report\.json\)/.test(md)) problems.push("the post must link the raw report (report.json).");
  if (!/\bwe (build|built|make|maintain) Swapcheck\b/i.test(md)) problems.push('the post must disclose that we build Swapcheck (for example "We build Swapcheck").');
  return problems;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function loadRegistry(path: string): Registry {
  const bytes = readFileSync(path);
  const sigPath = `${path}.sig`;
  if (existsSync(sigPath)) {
    const key = createPublicKey(readFileSync(join(import.meta.dirname, "..", "registry-public.pem")));
    if (!verify(null, bytes, key, Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64"))) {
      throw new Error(`The registry signature at ${sigPath} does not verify; refusing to use it.`);
    }
  }
  return JSON.parse(bytes.toString("utf8"));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const regIndex = args.indexOf("--registry");
  const registryPath = regIndex >= 0 ? args[regIndex + 1] : undefined;
  const rest = regIndex >= 0 ? args.filter((_, i) => i !== regIndex && i !== regIndex + 1) : args;
  let dirs = rest.filter((a) => a !== "--all");
  if (rest.includes("--all")) {
    dirs = dirs.flatMap((root) => readdirSync(root).map((d) => join(root, d)).filter((d) => statSync(d).isDirectory()));
  }
  const registry = registryPath && existsSync(registryPath) ? loadRegistry(registryPath) : undefined;
  let failed = 0;
  for (const dir of dirs) {
    const problems = checkPost(dir, registry);
    if (problems.length) {
      failed++;
      process.stdout.write(`FAIL ${dir}\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
    } else process.stdout.write(`ok   ${dir}\n`);
  }
  if (!dirs.length) process.stdout.write("No post bundles to check.\n");
  process.exit(failed ? 1 : 0);
}
