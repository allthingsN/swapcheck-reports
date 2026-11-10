# claude-sonnet-4-5-20250929 retires on 2026-11-30, replaced by claude-sonnet-5-5

*Change notice from registry data. Swapcheck 0.1.0. 2026-11-10.*

Anthropic's deprecations page says `claude-sonnet-4-5-20250929` retires on the Claude API on 2026-11-30, with `claude-sonnet-5-5` as the recommended replacement. After that date, requests to it fail.

## What changes

- Model: `claude-sonnet-4-5-20250929` on the Claude API (route `anthropic-api`)
- Replacement: `claude-sonnet-5-5`, named by the provider
- Date: 2026-11-30 (the date the provider gives)
- Confidence: high, stated on the provider's own page
- Source: [Anthropic deprecations page](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- Registry event: `anthropic-api.retirement.claude-sonnet-4-5-20250929`

## Price, per million tokens

| | Input | Output |
| --- | --- | --- |
| `claude-sonnet-4-5-20250929` | $3 | $15 |
| `claude-sonnet-5-5` | $2 | $10 |
| Change | -33.3% | -33.3% |

## On other platforms

The same model has its own schedule elsewhere:

- Amazon Bedrock: `anthropic.claude-sonnet-4-5-20250929-v1:0` retires on 2027-04-08.
- Microsoft Foundry: `claude-sonnet-4-5` retires on 2026-11-30. Replacement: `claude-sonnet-5-5`.

## What to do

- Find every place your code uses it: `npx @allthingsai/swapcheck scan`.
- See replacement options that fit your requirements: `npx @allthingsai/swapcheck find claude-sonnet-4-5-20250929`.
- Before the date, measure the replacement on your own cases: `npx @allthingsai/swapcheck test --to claude-sonnet-5-5`.
- Keep watching for changes in CI: `npx @allthingsai/swapcheck watch`.

## Measured

Runs: 0. This notice is generated from registry data by a template; no model was called.

## Limits

- This notice restates registry data as of 2026-11-10. The registry last confirmed the source page on 2026-11-10; providers can change dates.
- No model was called for this notice. It does not measure whether the replacement handles your prompts the same way.
- Prices come from models.dev through the registry, not from the provider's pricing page, and exclude caching, batch and long-context tiers.
- Other platforms keep their own schedules; the dates listed for them are separate events.

## Raw data

- [report.json](./report.json): the event, prices and limits behind every number above.
- Registry snapshot: [snapshot.json](https://allthingsn.github.io/swapcheck-registry/snapshot.json), generated 2026-11-10T18:10:33.335Z.

## Disclosure

We build Swapcheck, the open-source tool and registry this notice comes from.
