/**
 * Signs a merged post bundle into release assets, with the registry's Ed25519 key.
 *   node tools/bundle.ts <bundle-dir> [--out release]           sign only
 *   node tools/bundle.ts --release <slugs-file> [--out release]  sign and publish each post as a GitHub release
 * The key comes only from REGISTRY_SIGNING_KEY_PEM. A bundle that fails check-post is never signed.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkPost } from "./check-post.ts";

const FILES = ["post.md", "report.json", "meta.json", "hero.png"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export interface Manifest {
  schema: "swapcheck.post-bundle/v1";
  slug: string;
  title: string;
  type: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export function buildBundle(dir: string, outRoot: string, privateKeyPem: string): string {
  const problems = checkPost(dir);
  if (problems.length) throw new Error(`${dir} fails check-post and was not signed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const slug = basename(dir);
  if (!SLUG.test(slug)) throw new Error(`The bundle directory name ${slug} is not a valid slug.`);
  const out = join(outRoot, slug);
  mkdirSync(out, { recursive: true });
  const manifest: Manifest = {
    schema: "swapcheck.post-bundle/v1",
    slug,
    title: meta.title,
    type: meta.type,
    files: FILES.map((path) => {
      const bytes = readFileSync(join(dir, path));
      copyFileSync(join(dir, path), join(out, path));
      return { path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
    }),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(out, "manifest.json"), manifestBytes);
  writeFileSync(join(out, "manifest.json.sig"), sign(null, manifestBytes, createPrivateKey(privateKeyPem)).toString("base64"));
  return out;
}

/** Checks the manifest signature, then every file's hash. */
export function verifyBundle(dir: string, publicKeyPem: string): string[] {
  const manifestBytes = readFileSync(join(dir, "manifest.json"));
  const signature = Buffer.from(readFileSync(join(dir, "manifest.json.sig"), "utf8").trim(), "base64");
  if (!verify(null, manifestBytes, createPublicKey(publicKeyPem), signature)) return ["manifest.json signature does not verify"];
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
  return manifest.files
    .filter((f) => createHash("sha256").update(readFileSync(join(dir, f.path))).digest("hex") !== f.sha256)
    .map((f) => `${f.path} does not match its hash`);
}

function release(slug: string, assetsDir: string): void {
  const tag = `post-${slug}`;
  const assets = [...FILES, "manifest.json", "manifest.json.sig"].map((f) => join(assetsDir, f));
  const run = (args: string[]) => execFileSync("gh", args, { stdio: ["ignore", "inherit", "inherit"] });
  let exists = true;
  try {
    execFileSync("gh", ["release", "view", tag], { stdio: "ignore" });
  } catch {
    exists = false;
  }
  if (exists) run(["release", "upload", tag, ...assets, "--clobber"]);
  else run(["release", "create", tag, ...assets, "--title", JSON.parse(readFileSync(join(assetsDir, "meta.json"), "utf8")).title, "--notes", `Signed post bundle for ${slug}. Verify manifest.json.sig with registry-public.pem.`]);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outRoot = outIndex >= 0 ? args[outIndex + 1] : "release";
  const key = process.env.REGISTRY_SIGNING_KEY_PEM;
  if (!key) {
    process.stderr.write("REGISTRY_SIGNING_KEY_PEM is not set; refusing to build an unsigned bundle.\n");
    process.exit(2);
  }
  const releaseIndex = args.indexOf("--release");
  if (releaseIndex >= 0) {
    const slugs = readFileSync(args[releaseIndex + 1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
    for (const slug of slugs) {
      if (!SLUG.test(slug)) throw new Error(`Refusing the post directory name ${slug}.`);
      release(slug, buildBundle(join("posts", slug), outRoot, key));
    }
    if (!slugs.length) process.stdout.write("No changed posts to release.\n");
  } else {
    const dir = args.find((a, i) => !a.startsWith("--") && i !== outIndex + 1);
    if (!dir) {
      process.stderr.write("Usage: node tools/bundle.ts <bundle-dir> [--out release]\n");
      process.exit(2);
    }
    process.stdout.write(`${buildBundle(dir, outRoot, key)}\n`);
  }
}
