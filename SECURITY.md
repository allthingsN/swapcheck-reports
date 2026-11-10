# Security policy

Posts from this repository are republished on other sites, which check each bundle's signature before importing it. A way to publish something that was not reviewed, or to change a signed post, is a security problem.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/allthingsN/swapcheck-reports/security/advisories/new). Do not open a public issue. For problems in the CLI, the Action or the MCP server, report to [allthingsN/swapcheck](https://github.com/allthingsN/swapcheck/security/advisories/new) instead.

We aim to acknowledge reports within three working days and to tell you what we plan to do within ten. We are a very small team, so these are goals and not guarantees. We will credit you unless you prefer otherwise.

## What is in scope

- A way to get a bundle signed without it being merged to `main`, or to change a signed file without the manifest check failing.
- A post or draft that makes `tools/check-post.ts` pass while the post states a number its report does not contain.
- A way for a pull request from outside the project to read the signing key or get write access.
- Any secret in this repository or its history. The suite uses synthetic data only.

## How posts are protected

| Promise | How |
| --- | --- |
| Nothing publishes without review | Drafts live in `drafts/` and are never released. Only posts merged into `posts/` on `main` are bundled. |
| Bundles are signed | `release-bundle` writes a manifest of SHA-256 file hashes and signs it with Ed25519. Importers pin `registry-public.pem`. |
| The signing key never meets pull requests | Pull requests run `check-post` with read-only permissions and no secrets. Only pushes to `main` can sign. |
| Posts say only what the data says | `check-post` fails a post that has a number missing from its report or linked registry event, or lacks its version, run count, date, limits, raw-report link or disclosure. |
