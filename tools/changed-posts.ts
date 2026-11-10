/**
 * Prints the slug of each post bundle under posts/ changed between two commits, one per line.
 *   node tools/changed-posts.ts <base-sha> <head-sha>
 * Only full SHAs are accepted; anything else (such as a first push) lists every post.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const [base, head] = process.argv.slice(2);
const allPosts = () => readdirSync("posts").filter((d) => statSync(join("posts", d)).isDirectory());

let slugs: string[];
if (base && head && SHA.test(base) && SHA.test(head) && !/^0+$/.test(base)) {
  const names = execFileSync("git", ["diff", "--name-only", base, head, "--", "posts"], { encoding: "utf8" }).split("\n");
  slugs = [...new Set(names.map((n) => n.split("/")[1]).filter((s): s is string => !!s && existsSync(join("posts", s)) && statSync(join("posts", s)).isDirectory()))];
} else {
  slugs = allPosts();
}
process.stdout.write(slugs.sort().map((s) => `${s}\n`).join(""));
