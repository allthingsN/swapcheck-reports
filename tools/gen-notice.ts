/**
 * Generates a change-notice post draft from one registry event. Templates only, no LLM, no clock:
 * the date comes from the snapshot, so the same snapshot and event always give the same bytes.
 *   node tools/gen-notice.ts --registry <snapshot.json> --event <event-id> [--out drafts] [--swapcheck-version 0.1.0]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { heroSpecFromReport, renderHero } from "./hero.ts";

export const REGISTRY_URL = "https://allthingsn.github.io/swapcheck-registry/snapshot.json";

export interface RegistryEvent {
  id: string;
  type: string;
  provider: string;
  route: string;
  model: string;
  to?: string;
  effective?: string;
  date_precision?: string;
  billing?: string;
  successor_basis?: string;
  params?: string[];
  source: string;
  confidence: string;
  first_seen: string;
  last_verified: string;
  notes?: string;
}

export interface RegistryModel {
  id: string;
  route: string;
  name: string;
  cost: { input: number; output: number };
  limit: { context: number; output: number };
}

export interface Snapshot {
  generated_at: string;
  events: RegistryEvent[];
  models: RegistryModel[];
}

const ROUTE_NAMES: Record<string, string> = {
  "anthropic-api": "the Claude API",
  "google-ai-studio": "the Gemini API in Google AI Studio",
  "google-vertex": "Vertex AI",
  "aws-bedrock": "Amazon Bedrock",
  "azure-foundry": "Microsoft Foundry",
  "openai-api": "the OpenAI API",
  openrouter: "OpenRouter",
};

const PRECISION: Record<string, string> = {
  exact: "the date the provider gives",
  earliest_possible: "the earliest possible date; it can move later",
  estimated: "an estimate",
};

const CONFIDENCE: Record<string, string> = {
  high: "high, stated on the provider's own page",
  medium: "medium, two independent secondary sources agree",
  low: "low, one secondary source or an inferred mapping",
};

export function slugFor(e: RegistryEvent): string {
  return `${e.type}-${e.model}-${e.route}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Change in percent, rounded to one decimal place. */
function pct(from: number, to: number): number | null {
  return from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null;
}

const routeName = (r: string) => ROUTE_NAMES[r] ?? r;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}%`;

export function buildNotice(snapshot: Snapshot, eventId: string, swapcheckVersion: string) {
  const event = snapshot.events.find((e) => e.id === eventId);
  if (!event) throw new Error(`The registry has no event with ID ${eventId}.`);
  const date = snapshot.generated_at.slice(0, 10);
  const slug = slugFor(event);
  const from = snapshot.models.find((m) => m.route === event.route && m.id === event.model) ?? null;
  const to = event.to ? snapshot.models.find((m) => m.route === event.route && m.id === event.to) ?? null : null;
  const priceChange = from && to ? { input_pct: pct(from.cost.input, to.cost.input), output_pct: pct(from.cost.output, to.cost.output) } : null;
  // The same model elsewhere: only provider-confirmed schedules, which differ by platform.
  const related = snapshot.events
    .filter((e) => e.id !== event.id && e.confidence === "high" && (e.type === "retirement" || e.type === "reroute") && e.route !== event.route && sameModel(e.model, event.model))
    .sort((a, b) => a.route.localeCompare(b.route) || a.id.localeCompare(b.id));

  const limits = [
    `This notice restates registry data as of ${date}. The registry last confirmed the source page on ${event.last_verified}; providers can change dates.`,
    "No model was called for this notice. It does not measure whether the replacement handles your prompts the same way.",
    ...(priceChange ? ["Prices come from models.dev through the registry, not from the provider's pricing page, and exclude caching, batch and long-context tiers."] : []),
    ...(related.length ? ["Other platforms keep their own schedules; the dates listed for them are separate events."] : []),
  ];

  const report = {
    schema: "swapcheck.notice/v1",
    swapcheck_version: swapcheckVersion,
    date,
    runs: 0,
    registry: { url: REGISTRY_URL, generated_at: snapshot.generated_at },
    event,
    models: { from, to },
    price_change: priceChange,
    related_events: related,
    limits,
  };

  const what = verbPhrase(event);
  const title = what.title;
  const excerpt = `${what.excerpt} The source is ${capitalize(event.provider)}'s own page, and nothing in this notice was measured.`;

  const lines: string[] = [
    `# ${title}`,
    "",
    `*Change notice from registry data. Swapcheck ${swapcheckVersion}. ${date}.*`,
    "",
    what.lede,
    "",
    "## What changes",
    "",
    `- Model: \`${event.model}\` on ${routeName(event.route)} (route \`${event.route}\`)`,
    ...(event.to ? [`- ${event.type === "reroute" ? "Served by" : "Replacement"}: \`${event.to}\`${event.successor_basis === "provider_named" ? ", named by the provider" : ""}`] : []),
    `- Date: ${event.effective ?? "not announced"}${event.date_precision ? ` (${PRECISION[event.date_precision] ?? event.date_precision})` : ""}`,
    ...(event.billing && event.billing !== "unknown" ? [`- Billing: ${event.billing === "replacement_rates" ? `at \`${event.to}\` rates` : "unchanged"}`] : []),
    `- Confidence: ${CONFIDENCE[event.confidence] ?? event.confidence}`,
    `- Source: [${capitalize(event.provider)} deprecations page](${event.source})`,
    `- Registry event: \`${event.id}\``,
    "",
  ];

  if (from && to && priceChange) {
    lines.push(
      "## Price, per million tokens",
      "",
      "| | Input | Output |",
      "| --- | --- | --- |",
      `| \`${from.id}\` | $${from.cost.input} | $${from.cost.output} |`,
      `| \`${to.id}\` | $${to.cost.input} | $${to.cost.output} |`,
      `| Change | ${priceChange.input_pct === null ? "n/a" : signed(priceChange.input_pct)} | ${priceChange.output_pct === null ? "n/a" : signed(priceChange.output_pct)} |`,
      "",
    );
  }

  if (related.length) {
    lines.push("## On other platforms", "", "The same model has its own schedule elsewhere:", "");
    for (const r of related) {
      lines.push(`- ${capitalize(routeName(r.route))}: ${relatedSentence(r, date)}`);
    }
    lines.push("");
  }

  lines.push(
    "## What to do",
    "",
    "- Find every place your code uses it: `npx swapcheck scan`.",
    `- See replacement options that fit your requirements: \`npx swapcheck find ${event.model}\`.`,
    ...(event.to ? [`- Before the date, measure the replacement on your own cases: \`npx swapcheck test --to ${event.to}\`.`] : []),
    "- Keep watching for changes in CI: `npx swapcheck watch`.",
    "",
    "## Measured",
    "",
    "Runs: 0. This notice is generated from registry data by a template; no model was called.",
    "",
    "## Limits",
    "",
    ...limits.map((l) => `- ${l}`),
    "",
    "## Raw data",
    "",
    "- [report.json](./report.json): the event, prices and limits behind every number above.",
    `- Registry snapshot: [snapshot.json](${REGISTRY_URL}), generated ${snapshot.generated_at}.`,
    "",
    "## Disclosure",
    "",
    "We build Swapcheck, the open-source tool and registry this notice comes from.",
    "",
  );

  const meta = {
    title,
    slug,
    excerpt,
    tag: event.provider,
    type: "notice",
    date,
    registry_events: [event.id],
    draft: true,
  };
  return { slug, post: lines.join("\n"), report, meta };
}

function relatedSentence(r: RegistryEvent, today: string): string {
  const id = `\`${r.model}\``;
  const repl = r.to ? ` Replacement: \`${r.to}\`.` : "";
  if (!r.effective) return `${id} is deprecated with a date not yet announced.${repl}`;
  if (r.date_precision === "earliest_possible") {
    return r.effective < today
      ? `${id} had an earliest retirement date of ${r.effective}, which has passed; the provider still lists it, so the actual date is not yet announced.${repl}`
      : `${id} retires no earlier than ${r.effective}.${repl}`;
  }
  const verb = r.type === "reroute" ? (r.effective < today ? "was rerouted" : "reroutes") : r.effective < today ? "retired" : "retires";
  return `${id} ${verb} on ${r.effective}.${repl}`;
}

function sameModel(a: string, b: string): boolean {
  // Platform IDs wrap the vendor ID, e.g. anthropic.claude-sonnet-4-5-20250929-v1:0.
  // Some platforms drop the date suffix (Azure lists claude-sonnet-4-5).
  const core = (s: string) => s.replace(/^[a-z]+\./, "").replace(/-v\d+:\d+$/, "").replace(/@.*$/, "").replace(/-\d{8}$/, "");
  return core(a) === core(b);
}

function verbPhrase(e: RegistryEvent): { title: string; lede: string; excerpt: string } {
  const where = routeName(e.route);
  const when = e.effective ? `${e.date_precision === "earliest_possible" ? "no earlier than" : "on"} ${e.effective}` : "on a date not yet announced";
  if (e.type === "reroute") {
    const billing = e.billing === "replacement_rates" ? ` and billed at \`${e.to}\` rates` : "";
    return {
      title: `${e.model} reroutes to ${e.to} ${when}`,
      lede: `${capitalize(e.provider)}'s deprecations page says that ${when}, requests to \`${e.model}\` on ${where} will be served by \`${e.to}\`${billing}. Code that keeps calling \`${e.model}\` will not fail. It will get a different model, at a different price, without an error to tell you.`,
      excerpt: `Requests to ${e.model} on ${where} will be served by ${e.to} ${when}.`,
    };
  }
  if (e.type === "retirement") {
    return {
      title: `${e.model} retires ${when}${e.to ? `, replaced by ${e.to}` : ""}`,
      lede: `${capitalize(e.provider)}'s deprecations page says \`${e.model}\` retires on ${where} ${when}${e.to ? `, with \`${e.to}\` as the recommended replacement` : ""}. After that date, requests to it fail.`,
      excerpt: `${e.model} retires on ${where} ${when}.`,
    };
  }
  return { title: `${e.model}: ${e.type.replace(/_/g, " ")} ${when}`, lede: `${capitalize(e.provider)} lists a ${e.type.replace(/_/g, " ")} for \`${e.model}\` on ${where} ${when}.`, excerpt: `${e.model}: ${e.type.replace(/_/g, " ")} ${when}.` };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function writeNotice(outDir: string, notice: ReturnType<typeof buildNotice>): string {
  const dir = join(outDir, notice.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "post.md"), notice.post);
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(notice.report, null, 2)}\n`);
  writeFileSync(join(dir, "meta.json"), `${JSON.stringify(notice.meta, null, 2)}\n`);
  writeFileSync(join(dir, "hero.png"), renderHero(heroSpecFromReport(notice.report, notice.meta)));
  return dir;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  const registry = arg("--registry");
  const eventId = arg("--event");
  if (!registry || !eventId) {
    process.stderr.write("Usage: node tools/gen-notice.ts --registry <snapshot.json> --event <event-id> [--out drafts] [--swapcheck-version 0.1.0]\n");
    process.exit(2);
  }
  const snapshot = JSON.parse(readFileSync(registry, "utf8")) as Snapshot;
  const notice = buildNotice(snapshot, eventId, arg("--swapcheck-version") ?? "0.1.0");
  process.stdout.write(`${writeNotice(arg("--out") ?? "drafts", notice)}\n`);
}
