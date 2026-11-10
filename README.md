# swapcheck-reports

Open workloads and publishing tools for Swapcheck reports and change notices. We build Swapcheck; this repository is how we publish what it measures, and how anyone can check that a post says only what its data says.

Related: the [Swapcheck CLI and Action](https://github.com/allthingsN/swapcheck), the signed [model-change registry](https://github.com/allthingsN/swapcheck-registry) the notices are generated from, and the [published reports](https://allthingsn.github.io/swapcheck/reports.html).

## Layout

| Path | What it is |
| --- | --- |
| `suite/` | Five open workloads in Swapcheck's case format, 8 cases each, with synthetic data only |
| `posts/` | Published post bundles, empty to start. Format: [posts/README.md](posts/README.md) |
| `drafts/` | Unpublished drafts, never released |
| `tools/check-post.ts` | Fails any post with a number not in its report or a linked registry event, or missing the version, run count, date, limits, raw-report link or disclosure |
| `tools/gen-notice.ts` | Generates a change-notice draft from a registry event, using templates and no LLM |
| `tools/hero.ts` | Deterministic 1200x630 hero PNG, using a built-in PNG encoder and bitmap font |
| `tools/bundle.ts` | Signs a merged bundle (a manifest of file hashes plus an Ed25519 signature) into release assets |
| `tools/build-suite.ts` | Source of the suite files; `--check` fails if `suite/` is stale |

## The suite

| Workload | Cases | Deterministic checks |
| --- | --- | --- |
| `json-extraction` | Invoices: subtotal vs total, discounts, missing due date, day-first dates, a corrected typo, a voided invoice, an injected instruction | `json_valid`, `json_schema` with exact `enum` values |
| `classification` | Support messages into 5 labels, including near-miss wording | `label_in` with only the correct label, output length |
| `tool-routing` | Order lookup, tracking, refunds, escalation, and two cases where no tool fits | `tool_called`, `tool_not_called` for every other tool, `tool_args_valid` |
| `summarization` | Incident, meeting, earnings, policy, call notes, abstract, release notes, a thread | Required facts, forbidden fabrications, bullet format, length |
| `code-fix` | Off-by-one, `==`, mutable default, missing `await`, `//`, sort comparator, unclosed file, inclusive bound | Regexes for the fix, absence of the bug, unchanged signature |

Run it with Swapcheck:

```sh
npx @allthingsai/swapcheck test --to <candidate>
```

Set `cases` to `suite` in `swapcheck.yaml`, or copy the files into `swapcheck/cases/`.

The names, companies, amounts, emails (`example.com`) and phone numbers (`555-01xx`) in the suite are invented.

## Change notices

```sh
node tools/gen-notice.ts --registry ../swapcheck-registry/dist/snapshot.json --event google-ai-studio.reroute.gemini-2.5-pro --out drafts
node tools/check-post.ts drafts/reroute-gemini-2-5-pro-google-ai-studio
```

The notice's date comes from the snapshot's `generated_at`, so the same snapshot and event always give byte-identical files.

`drafts/` holds two notices generated from the 2026-11-10 snapshot:

- the Gemini 2.5 Pro re-route on Google AI Studio
- the Claude Sonnet 4.5 retirement on the Claude API

Neither is published.

## Development

Node 24 or newer is required. There are no dependencies.

```sh
npm test
```

## Automation

- `check-post.yml` runs on pull requests. It runs the tests, checks that the suite is current, fetches and verifies the signed registry, then checks every bundle in `posts/`.
- `release-bundle.yml` runs on pushes to `main` that change `posts/`. It signs each changed bundle with `REGISTRY_SIGNING_KEY_PEM` and attaches it to the release `post-<slug>`.

Actions are pinned by commit SHA, permissions are read-only by default, and neither workflow uses `pull_request_target`.

## Licenses

Tools are licensed Apache-2.0 (`LICENSE`). Suite data and posts are licensed CC BY 4.0 (`LICENSE-DATA`).
