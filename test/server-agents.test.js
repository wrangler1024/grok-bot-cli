import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { connectGateway, getTranscriptTail, listAgents, sendPrompt } from "../src/core/gateway.js";

const agentId = "00000000-0000-4000-8000-000000000001";
const serverAgent = { id: "42", agentId, name: "Test Bot", harness: "temporal", viewerSessionId: "test-viewer" };
const encoded = value => Buffer.from(JSON.stringify(value)).toString("base64");

function fixture(t, overrides = {}) {
  const home = mkdtempSync(join(tmpdir(), "gbot-server-test-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const [key, value] of Object.entries({
    GROK_BOT_TEST: "1", CURSOR_ACCESS_TOKEN: "test-account-token",
    CURSOR_API_BASE_URL: "http://127.0.0.1:1340", SAND_CLIENT_VERSION: "1.1.0",
    GROK_BOT_GATEWAY_URL: null, GROK_BOT_GATEWAY_TOKEN: null, GROK_BOT_GATEWAY_HEADERS: null,
  })) {
    const previous = process.env[key];
    if (value === null) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const calls = [];
  const responses = {
    EnsureSandBox: { gatewayUrl: "http://127.0.0.1:1341", gatewayToken: "test-gateway", gatewayPortToken: "test-port" },
    listAgents: { agents: [{ id: agentId, name: "Test Bot" }] },
    ListGrokBotAgents: { agents: [serverAgent] },
    SendGrokBotUserMessage: { delivery: "GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_TEMPORAL" },
    GetGrokBotSendStatus: { status: "GROK_BOT_SEND_STATUS_ACCEPTED", echoEntryId: "test-user-1" },
    ListGrokBotTranscriptEntries: { entries: [] },
    ...overrides,
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const method = new URL(url).pathname.split("/").at(-1);
    const call = { method, url: String(url), body: JSON.parse(options.body), options };
    calls.push(call);
    assert.equal(new URL(url).hostname, "127.0.0.1");
    assert.equal(options.redirect, "error");
    if (!(method in responses)) throw new Error(`Unexpected method ${method}`);
    const value = responses[method];
    return typeof value === "function" ? value(call) : Response.json(value);
  });
  return { home, calls, connect: () => connectGateway({ appSessionOptions: { home, platform: "linux", env: { XDG_CONFIG_HOME: home } } }) };
}

test("temporal roster keeps routable UUIDs, current names and viewer scopes", async t => {
  const f = fixture(t);
  const rows = await listAgents(await f.connect());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, agentId);
  assert.equal(rows[0].harness, "temporal");
  assert.equal(rows[0].viewerSessionId, "test-viewer");
  const gateway = f.calls.find(call => call.method === "listAgents");
  assert.equal(gateway.options.headers["x-anyrun-port-token"], "test-port");
  const backend = f.calls.find(call => call.method === "ListGrokBotAgents");
  assert.equal(backend.options.headers.authorization, "Bearer test-account-token");
});

test("truncated server rosters refuse target resolution before sending", async t => {
  const f = fixture(t, { ListGrokBotAgents: { agents: [serverAgent], truncated: true } });
  await assert.rejects(sendPrompt(await f.connect(), "Test Bot", "test"), /truncated/);
  assert.equal(f.calls.some(call => call.method === "SendGrokBotUserMessage"), false);
});

test("legacy Bot routes remain on the gateway when no temporal record exists", async t => {
  const f = fixture(t, { ListGrokBotAgents: { agents: [] }, sendPrompt: { messageId: "legacy-echo" } });
  const result = await sendPrompt(await f.connect(), "Test Bot", "test");
  assert.equal(result.messageId, "legacy-echo");
  assert.equal(f.calls.filter(call => call.method === "sendPrompt").length, 1);
  assert.equal(f.calls.some(call => call.method === "SendGrokBotUserMessage"), false);
});

test("temporal sends retain the nonce, text, reply and viewer session", async t => {
  const f = fixture(t);
  const result = await sendPrompt(await f.connect(), "Test Bot", "synthetic test", { clientNonce: "stable-nonce", replyToId: "prior-entry" });
  assert.equal(result.delivery, "accepted");
  assert.equal(result.messageId, "test-user-1");
  const writes = f.calls.filter(call => call.method === "SendGrokBotUserMessage");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.messageId, "stable-nonce");
  assert.equal(writes[0].body.agentId, agentId);
  assert.equal(writes[0].body.sessionId, "test-viewer");
  assert.equal(writes[0].body.text, "synthetic test");
  assert.equal(writes[0].body.replyToId, "prior-entry");
  assert.equal(f.calls.some(call => call.method === "sendPrompt"), false);
});

for (const delivery of [2, 3, "DUPLICATE"]) {
  test(`temporal delivery ${delivery} is confirmed through an actual echo`, async t => {
    const f = fixture(t, { SendGrokBotUserMessage: { delivery } });
    assert.equal((await sendPrompt(await f.connect(), "Test Bot", "test")).messageId, "test-user-1");
  });
}

for (const [response, expected] of [
  [() => Response.json({ delivery: "GROK_BOT_USER_MESSAGE_DELIVERY_REFUSED", refusal: { message: "test refusal" } }), "rejected"],
  [() => new Response("server error", { status: 503 }), "unknown"],
  [() => { throw new TypeError("test transport loss"); }, "unknown"],
]) {
  test(`server send failure remains ${expected} without retrying`, async t => {
    const f = fixture(t, { SendGrokBotUserMessage: response });
    await assert.rejects(sendPrompt(await f.connect(), "Test Bot", "test"), error => error.delivery === expected);
    assert.equal(f.calls.filter(call => call.method === "SendGrokBotUserMessage").length, 1);
    assert.equal(f.calls.some(call => call.method === "sendPrompt"), false);
  });
}

test("an accepted send with no echo remains unknown and is never retransmitted", async t => {
  const f = fixture(t, { GetGrokBotSendStatus: () => new Response("unavailable", { status: 503 }) });
  const result = await sendPrompt(await f.connect(), "Test Bot", "test");
  assert.equal(result.delivery, "unknown");
  assert.equal(result.messageId, undefined);
  assert.equal(f.calls.filter(call => call.method === "SendGrokBotUserMessage").length, 1);
});

test("server transcript nonce readback confirms an accepted send without a status receipt", async t => {
  const f = fixture(t, {
    GetGrokBotSendStatus: {},
    ListGrokBotTranscriptEntries: { entries: [{ seq: "1", entryId: "actual-readback", body: encoded({ clientNonce: "stable-nonce", kind: "message", role: "user", text: "test" }) }] },
  });
  assert.equal((await sendPrompt(await f.connect(), "Test Bot", "test", { clientNonce: "stable-nonce" })).messageId, "actual-readback");
});

test("server tail decodes bodies, sorts full-width sequence numbers and bounds the request", async t => {
  const f = fixture(t, { ListGrokBotTranscriptEntries: { entries: [
    { seq: "9007199254740993", entryId: "reply", body: encoded({ kind: "send-message", message: "synthetic reply" }) },
    { seq: "9007199254740992", entryId: "request", body: encoded({ kind: "message", role: "user", text: "synthetic request" }) },
  ] } });
  const result = await getTranscriptTail(await f.connect(), "Test Bot", 9999);
  assert.deepEqual(result.transcript.entries.map(entry => entry.id), ["request", "reply"]);
  assert.equal(result.transcript.entries[1].message, "synthetic reply");
  const call = f.calls.find(call => call.method === "ListGrokBotTranscriptEntries");
  assert.equal(call.body.limit, 200);
  assert.equal(call.body.sessionId, "test-viewer");
});

test("omitted server bodies stay explicit and invalid bodies refuse decoding", async t => {
  const f = fixture(t, { ListGrokBotTranscriptEntries: { entries: [{ seq: "1", entryId: "omitted", bodyOmitted: true }] } });
  assert.match((await getTranscriptTail(await f.connect(), "Test Bot")).transcript.entries[0].text, /unavailable/);
});

test("invalid server body JSON is rejected", async t => {
  const f = fixture(t, { ListGrokBotTranscriptEntries: { entries: [{ seq: "1", body: Buffer.from("not json").toString("base64") }] } });
  await assert.rejects(getTranscriptTail(await f.connect(), "Test Bot"), /decode/);
});

test("active account drift during a server send remains unknown without retrying", async t => {
  let save;
  const f = fixture(t, { SendGrokBotUserMessage: () => { save("second"); return Response.json({ delivery: 2 }); } });
  delete process.env.CURSOR_ACCESS_TOKEN;
  const dir = join(f.home, "Grok Bot");
  mkdirSync(dir);
  const encrypt = value => {
    const key = crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
    const cipher = crypto.createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
    return Buffer.concat([Buffer.from("v10"), cipher.update(value), cipher.final()]).toString("base64");
  };
  save = active => writeFileSync(join(dir, "sand-secrets.json"), JSON.stringify({ version: 1, "cursor-accounts": JSON.stringify({ active, accounts: {
    first: { "cursor-access-token": encrypt("first-test-token") },
    second: { "cursor-access-token": encrypt("second-test-token") },
  } }) }));
  save("first");
  await assert.rejects(sendPrompt(await f.connect(), "Test Bot", "test"), error => error.delivery === "unknown" && /account changed/.test(error.message));
  assert.equal(f.calls.filter(call => call.method === "SendGrokBotUserMessage").length, 1);
});

for (const [status, reason, source, reconnects] of [
  [404, "pod_not_found", "anyrun-proxy", 1],
  [404, "pod_not_found", "application", 0],
  [404, "missing_method", "anyrun-proxy", 0],
]) {
  test(`404 route recovery requires exact proxy evidence (${source}/${reason})`, async t => {
    let reads = 0;
    const f = fixture(t, { listAgents: () => {
      reads++;
      return reads === 1 ? new Response("missing", { status, headers: { "x-anyrun-error-source": source, "x-anyrun-failure-reason": reason } })
        : Response.json({ agents: [{ id: agentId, name: "Test Bot" }] });
    } });
    const session = await f.connect();
    if (reconnects) await listAgents(session); else await assert.rejects(listAgents(session), { status });
    assert.equal(f.calls.filter(call => call.method === "EnsureSandBox").length, 1 + reconnects);
  });
}
