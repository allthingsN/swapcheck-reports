# Post bundles

Each published post is one directory, `posts/<slug>/`, holding exactly these four files:

| File | Contents |
| --- | --- |
| `post.md` | The post in Markdown |
| `report.json` | The data behind every number in the post: a Swapcheck report (`swapcheck.report/v1`) for measured posts, or a notice report (`swapcheck.notice/v1`) for change notices |
| `hero.png` | 1200x630 image made by `tools/hero.ts` from `report.json` |
| `meta.json` | Listing data, described below |

## meta.json

```json
{
  "title": "gemini-2.5-pro reroutes to gemini-3.8-flash on 2026-12-01",
  "slug": "reroute-gemini-2-5-pro-google-ai-studio",
  "excerpt": "One or two sentences for listings and feeds.",
  "tag": "google",
  "type": "notice",
  "date": "2026-11-10",
  "registry_events": ["google-ai-studio.reroute.gemini-2.5-pro"]
}
```

- `title`, `slug`, `excerpt`, `tag` and `type` are required. `slug` must equal the directory name.
- `type` is one of:
  - `notice`: a registry change
  - `swap`: a measured model-to-model comparison
  - `fit`: which models suit a workload
  - `monthly`: a roundup
- `registry_events` links registry event IDs. Numbers from a linked event count as evidence.

## Rules `tools/check-post.ts` enforces

- Every number and every digit-bearing identifier in `post.md`, the title and the excerpt appears in `report.json` or in a linked registry event. A fraction in the report may be written as a percentage, and a field ending in `_pct` already holds one.
- The post states:
  - the Swapcheck version, as `Swapcheck <version>`
  - the run count, as `Runs: N` or `N runs`
  - the date
- It has a `## Limits` section with at least one bullet.
- It links its raw report, as `[report.json](./report.json)`.
- It discloses that we build Swapcheck.
- `hero.png` is a PNG.

## Lifecycle

1. Drafts live in `drafts/` and are never released. For change notices, generate one with `node tools/gen-notice.ts --registry <snapshot.json> --event <id>`.
2. To publish, move the bundle into `posts/` in a pull request. `check-post.yml` runs on it.
3. On merge, `release-bundle.yml` checks the bundle again and signs `manifest.json`, which lists each file's SHA-256, with the registry's Ed25519 key. It then attaches the files, the manifest and `manifest.json.sig` to the GitHub release `post-<slug>`.
4. Verify a release with `registry-public.pem`: check the manifest signature, then each file's hash (see `verifyBundle` in `tools/bundle.ts`).
