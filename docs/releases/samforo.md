# Samforo compatibility release

Maintained source fork of [ScriptedAlchemy/grok-bot-cli](https://github.com/ScriptedAlchemy/grok-bot-cli), based on upstream `v0.12.5` and retaining its MIT license.

This release includes stale-route 404 recovery, gateway port-token headers, and server Bot send/status/transcript support for the Grok Bot 1.1.0 protocol. Prompt writes are never automatically replayed, and unknown delivery still requires readback.

The original patch completed an actual native Codex MCP send/reply round trip on macOS. This tagged source is built and tested in GitHub Actions; see the public test run for its exact results. Account data and private message receipts are excluded.

Download the `.tgz` and check its SHA-256 against `SHA256SUMS`, then install it with `npm install --global ./grok-bot-cli-<version>.tgz`. Reload the MCP connection after replacing an already-running package.

Details: [Compatibility and maintenance](https://github.com/wrangler1024/grok-bot-cli/blob/main/docs/COMPATIBILITY.md).
