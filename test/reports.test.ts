import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { SUITE, render } from "../tools/build-suite.ts";
import { buildBundle, verifyBundle } from "../tools/bundle.ts";
import { checkPost } from "../tools/check-post.ts";
import { buildNotice, writeNotice } from "../tools/gen-notice.ts";
import type { Snapshot } from "../tools/gen-notice.ts";
import { HEIGHT, WIDTH, renderHero } from "../tools/hero.ts";

const ROOT = join(import.meta.dirname, "..");
const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, "test/fixtures/registry-subset.json"), "utf8")) as Snapshot;
const GEMINI = "google-ai-studio.reroute.gemini-2.5-pro";
const SONNET = "anthropic-api.retirement.claude-sonnet-4-5-20250929";

function tempNotice(eventId: string): string {
  const dir = mkdtempSync(join(tmpdir(), "notice-"));
  return writeNotice(dir, buildNotice(SNAPSHOT, eventId, "0.1.0"));
}

test("the suite has five workloads of eight team cases each, checked into suite/", () => {
  assert.deepEqual(Object.keys(SUITE).sort(), ["classification", "code-fix", "json-extraction", "summarization", "tool-routing"]);
  const ids = new Set<string>();
  for (const [name, cases] of Object.entries(SUITE)) {
    assert.equal(cases.length, 8, name);
    for (const c of cases) {
      assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
      ids.add(c.id);
      assert.equal(c.origin, "team");
      assert.equal(c.accepted, true);
      assert.ok(c.checks.length >= 2, `${c.id} needs more than one check`);
      assert.ok(!c.checks.some((k) => k.type === "meaning"), `${c.id} should use deterministic checks`);
    }
    assert.equal(readFileSync(join(ROOT, "suite", `${name}.json`), "utf8"), render(cases), `suite/${name}.json is stale`);
  }
});

test("suite data is synthetic: emails use example.com and phones use the 555-01xx range", () => {
  const all = readdirSync(join(ROOT, "suite")).map((f) => readFileSync(join(ROOT, "suite", f), "utf8")).join("\n");
  for (const m of all.matchAll(/[\w.+-]+@([\w-]+\.[\w.]+)/g)) assert.equal(m[1], "example.com", m[0]);
  for (const m of all.matchAll(/\b\d{3}-\d{4}\b/g)) assert.match(m[0], /^555-01\d\d$/);
});

test("extraction checks pin exact values and tool cases forbid the wrong tools", () => {
  const extract = SUITE["json-extraction"].find((c) => c.id === "extract-subtotal-vs-total")!;
  const schema = extract.checks.find((k) => k.type === "json_schema")!.schema as { properties: Record<string, { enum: unknown[] }> };
  assert.deepEqual(schema.properties.total.enum, [1080]);
  const route = SUITE["tool-routing"].find((c) => c.id === "route-status-not-refund")!;
  assert.ok(route.checks.some((k) => k.type === "tool_not_called" && k.name === "refund_order"));
});

test("gen-notice is deterministic and needs no clock", () => {
  const a = buildNotice(SNAPSHOT, GEMINI, "0.1.0");
  const b = buildNotice(SNAPSHOT, GEMINI, "0.1.0");
  assert.deepEqual(a, b);
  assert.equal(a.meta.date, SNAPSHOT.generated_at.slice(0, 10));
  const dir1 = tempNotice(GEMINI);
  const dir2 = tempNotice(GEMINI);
  for (const f of ["post.md", "report.json", "meta.json", "hero.png"]) assert.ok(readFileSync(join(dir1, f)).equals(readFileSync(join(dir2, f))), f);
});

test("the Gemini notice states the re-route, billing, price change and the separate Vertex schedule", () => {
  const n = buildNotice(SNAPSHOT, GEMINI, "0.1.0");
  assert.match(n.post, /served by `gemini-3\.8-flash` and billed at `gemini-3\.8-flash` rates/);
  assert.match(n.post, /\| Change \| -40% \| -62\.5% \|/);
  assert.match(n.post, /Vertex AI: `gemini-2\.5-pro` had an earliest retirement date of 2026-10-20/);
  assert.equal(n.meta.type, "notice");
  assert.deepEqual(n.meta.registry_events, [GEMINI]);
});

test("the Sonnet notice names the replacement and the other platforms", () => {
  const n = buildNotice(SNAPSHOT, SONNET, "0.1.0");
  assert.equal(n.meta.title, "claude-sonnet-4-5-20250929 retires on 2026-11-30, replaced by claude-sonnet-5-5");
  assert.match(n.post, /Amazon Bedrock: `anthropic\.claude-sonnet-4-5-20250929-v1:0` retires on 2027-04-08/);
  assert.match(n.post, /Microsoft Foundry: `claude-sonnet-4-5` retires on 2026-11-30/);
});

test("check-post passes generated notices and the committed drafts", () => {
  for (const id of [GEMINI, SONNET]) assert.deepEqual(checkPost(tempNotice(id)), []);
  for (const d of readdirSync(join(ROOT, "drafts"))) assert.deepEqual(checkPost(join(ROOT, "drafts", d)), [], d);
});

test("check-post fails a number or model ID that is not in the evidence", () => {
  const dir = tempNotice(GEMINI);
  const post = readFileSync(join(dir, "post.md"), "utf8");
  writeFileSync(join(dir, "post.md"), post.replace("-62.5%", "-70%").replace("Runs: 0.", "Runs: 0. It is 3x faster than gemini-9-ultra."));
  const problems = checkPost(dir).join("\n");
  assert.match(problems, /numbers not found.*-70%/);
  assert.match(problems, /3x|numbers not found.*3/);
  assert.match(problems, /identifiers not found.*gemini-9-ultra/);
});

test("check-post requires version, run count, date, limits, raw-report link and disclosure", () => {
  const dir = tempNotice(SONNET);
  const post = readFileSync(join(dir, "post.md"), "utf8");
  const stripped = post
    .replace(/Swapcheck 0\.1\.0\. /, "")
    .replace(/Runs: 0\. /, "")
    .replace(/## Limits/, "## Notes")
    .replace(/\[report\.json\]\(\.\/report\.json\)/, "report")
    .replace(/We build Swapcheck/, "Swapcheck is");
  writeFileSync(join(dir, "post.md"), stripped);
  const problems = checkPost(dir).join("\n");
  for (const needle of ["version", "run count", "Limits", "raw report", "disclose"]) assert.match(problems, new RegExp(needle), needle);
});

test("check-post rejects a version that is not a plain version number", () => {
  const dir = tempNotice(SONNET);
  const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
  writeFileSync(join(dir, "report.json"), JSON.stringify({ ...report, swapcheck_version: "0.1.(0|.*)" }));
  assert.match(checkPost(dir).join("\n"), /swapcheck_version must look like 0\.1\.3/);
});

test("check-post validates meta.json and the hero image", () => {
  const dir = tempNotice(SONNET);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ ...meta, type: "opinion", slug: "elsewhere" }));
  writeFileSync(join(dir, "hero.png"), "not a png");
  const problems = checkPost(dir).join("\n");
  assert.match(problems, /type must be one of notice, swap, fit, monthly/);
  assert.match(problems, /slug must match/);
  assert.match(problems, /hero.png is not a PNG/);
});

test("hero.png is a valid, deterministic 1200x630 PNG", () => {
  const spec = { kicker: "SWAPCHECK", title: "gemini-2.5-pro", subtitle: "> gemini-3.8-flash", detail: "REROUTES ON 2026-12-01", bars: [{ label: "baseline", value: 0.9 }] };
  const a = renderHero(spec);
  assert.ok(a.equals(renderHero(spec)));
  assert.equal(a.readUInt32BE(16), WIDTH);
  assert.equal(a.readUInt32BE(20), HEIGHT);
  const idat = a.indexOf("IDAT");
  const length = a.readUInt32BE(idat - 4);
  const raw = inflateSync(a.subarray(idat + 4, idat + 4 + length));
  assert.equal(raw.length, (WIDTH * 3 + 1) * HEIGHT);
});

test("bundles are signed over a manifest of file hashes and refuse failing posts", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  const out = mkdtempSync(join(tmpdir(), "release-"));
  const bundle = buildBundle(tempNotice(GEMINI), out, priv);
  assert.deepEqual(verifyBundle(bundle, pub), []);
  writeFileSync(join(bundle, "post.md"), "tampered");
  assert.deepEqual(verifyBundle(bundle, pub), ["post.md does not match its hash"]);

  const bad = tempNotice(SONNET);
  writeFileSync(join(bad, "post.md"), readFileSync(join(bad, "post.md"), "utf8").replace("We build Swapcheck", "Swapcheck is"));
  assert.throws(() => buildBundle(bad, out, priv), /fails check-post/);
});

test("posts/ ships empty with its format documented", () => {
  assert.deepEqual(readdirSync(join(ROOT, "posts")).sort(), [".gitkeep", "README.md"]);
  assert.match(readFileSync(join(ROOT, "posts/README.md"), "utf8"), /meta\.json/);
});

test("workflows pin actions by full SHA, use least privilege and avoid pull_request_target", () => {
  const dir = join(ROOT, ".github/workflows");
  assert.deepEqual(readdirSync(dir).sort(), ["check-post.yml", "release-bundle.yml"]);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    assert.equal(text.includes("pull_request_target"), false);
    assert.match(text, /^permissions:\n {2}contents: read/m);
    for (const use of text.matchAll(/uses:\s*(\S+)/g)) assert.match(use[1], /@[0-9a-f]{40}$/);
    assert.equal(/\$\{\{\s*github\.event\.(head_commit|pull_request)\.[^}]*\}\}/.test(text.split("run:").slice(1).join("")), false, `${file} interpolates event text into a script`);
  }
});

test("a copied bundle keeps verifying, so release assets can be checked anywhere", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const out = mkdtempSync(join(tmpdir(), "release-"));
  const bundle = buildBundle(tempNotice(SONNET), out, privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const copy = mkdtempSync(join(tmpdir(), "copy-"));
  cpSync(bundle, copy, { recursive: true });
  assert.deepEqual(verifyBundle(copy, publicKey.export({ type: "spki", format: "pem" }).toString()), []);
});
