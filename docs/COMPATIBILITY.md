# Samforo compatibility maintenance

This public source fork is maintained at [wrangler1024/grok-bot-cli](https://github.com/wrangler1024/grok-bot-cli).
The upstream base is [ScriptedAlchemy/grok-bot-cli v0.12.5](https://github.com/ScriptedAlchemy/grok-bot-cli/tree/v0.12.5), commit `96079dbcb3cc9bc3a6154fe404d0f0def1d4c910`.
The original MIT license and attribution are retained.

## Compatibility changes

- Reconnect a cached route once when a read receives HTTP 404 with the exact proxy source `anyrun-proxy` and reason `pod_not_found`. Ordinary 404s and write requests are not replayed. Existing HTTP 417 hibernation recovery remains available.
- Map `EnsureSandBox.gatewayPortToken` to `x-anyrun-port-token`; explicit routing headers and the existing network-token route keep their precedence.
- Resolve server Bots with `harness=temporal` through the active account's `ListGrokBotAgents` result. Use the routable `agentId`, not the backend database identifier.
- Send through `SendGrokBotUserMessage`, keep the client nonce, and use `GetGrokBotSendStatus` or matching transcript readback for the message receipt.
- Read bounded server transcript tails through `ListGrokBotTranscriptEntries`, decode JSON bodies, retain entry IDs, and order 64-bit sequence numbers without losing precision.

The compatibility layer follows the Grok Bot 1.1.0 desktop protocol. Backend APIs can evolve; compatibility tests and release notes should accompany future changes.

## Delivery and account handling

An immediate send receipt can still be `unknown` even when the backend accepted the message. Read the target thread and correlate its nonce or unique task marker before considering another send. The compatibility layer never retries a prompt automatically.

Credentials continue to come from the original CLI's encrypted active-account session. Host restrictions, capped responses, redirect refusal, viewer-session scope and account-change checks remain in effect. No credential files or real user conversation records are included in this repository.

Gateway-only operations, rooted thread reads and automatic Codex reply bridges retain upstream implementations. The added server compatibility is verified for ordinary sends and cursor-based transcript-tail reads. Automatic reply injection was not part of the live acceptance check.

## Validation

The original local patch was verified on macOS with Grok Bot 1.1.0. A real native Codex MCP send and a separate Bot reply were read back and matched by a unique marker. A send initially reported `unknown`; transcript readback confirmed delivery without a resend. Private account, machine and conversation identifiers stay outside the public repository.

This repository ports those changes into source and adds loopback-only automated tests. `npm run check` validates metadata, builds the committed artifact, typechecks routes and runs the upstream suites plus server-agent regressions. Automated tests do not contact a signed-in account.

## Maintenance and release

Fork versions use the `-samforo.N` suffix. The first version is `0.12.5-samforo.1`.
GitHub Actions builds tagged releases, attaches the npm-installable archive and publishes its SHA-256 checksum. The package is marked private to keep fork publication on GitHub; upstream npm publication remains guarded to the upstream repository.

To develop locally:

```sh
npm ci
npm run check
npm pack
```

Source changes belong in `src/`; rebuild `artifact/` and commit its updated source manifest. Keep the upstream remote to compare future releases. Retest stale-route recovery, port headers, account drift, delivery uncertainty and transcript readback before advancing a maintained version.
