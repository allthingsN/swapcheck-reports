# gemini-2.5-pro reroutes to gemini-3.8-flash on 2026-12-01

*Change notice from registry data. Swapcheck 0.1.0. 2026-11-10.*

Google's deprecations page says that on 2026-12-01, requests to `gemini-2.5-pro` on the Gemini API in Google AI Studio will be served by `gemini-3.8-flash` and billed at `gemini-3.8-flash` rates. Code that keeps calling `gemini-2.5-pro` will not fail. It will get a different model, at a different price, without an error to tell you.

## What changes

- Model: `gemini-2.5-pro` on the Gemini API in Google AI Studio (route `google-ai-studio`)
- Served by: `gemini-3.8-flash`, named by the provider
- Date: 2026-12-01 (the date the provider gives)
- Billing: at `gemini-3.8-flash` rates
- Confidence: high, stated on the provider's own page
- Source: [Google deprecations page](https://aistudio.google.com/docs/deprecations)
- Registry event: `google-ai-studio.reroute.gemini-2.5-pro`

## Price, per million tokens

| | Input | Output |
| --- | --- | --- |
| `gemini-2.5-pro` | $1.25 | $10 |
| `gemini-3.8-flash` | $0.75 | $3.75 |
| Change | -40% | -62.5% |

## On other platforms

The same model has its own schedule elsewhere:

- Vertex AI: `gemini-2.5-pro` had an earliest retirement date of 2026-10-20, which has passed; the provider still lists it, so the actual date is not yet announced. Replacement: `gemini-3.8-flash`.

## What to do

- Find every place your code uses it: `npx swapcheck scan`.
- See replacement options that fit your requirements: `npx swapcheck find gemini-2.5-pro`.
- Before the date, measure the replacement on your own cases: `npx swapcheck test --to gemini-3.8-flash`.
- Keep watching for changes in CI: `npx swapcheck watch`.

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
