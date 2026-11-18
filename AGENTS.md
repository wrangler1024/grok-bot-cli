# Agent instructions

This repository is the independently maintained Samforo compatibility fork at
`wrangler1024/grok-bot-cli`, based on upstream `v0.12.5`. Fork distributions use
GitHub Releases through `.github/workflows/fork-release.yml`; keep the npm package
private and do not publish it to npm. Keep the upstream MIT license and attribution.

Upstream npm publishing belongs exclusively to `.github/workflows/release.yml` with GitHub OIDC.
That workflow is guarded to run only in the upstream repository.
Its package release script is a workflow entrypoint: never publish locally,
request npm publishing tokens/login, or troubleshoot local publishing auth.
Use Changesets for future source changes. Verify Actions and the tagged GitHub
release artifact before updating installations. Never include local account
stores, machine-specific configuration or real conversation receipts in commits.

Delete dead code, obsolete scripts, duplicate workarounds, and unused legacy
installs. Check active owners/references first; preserve auth, operator env,
durable data, and intentional duplicate suppression. Prefer existing helpers,
stdlib, and native features over new wrappers or fallback frameworks.
