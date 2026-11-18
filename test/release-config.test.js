import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { inspect, readArtifactManifest } from "agent-bundle/api";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const readJson = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactRoot = fileURLToPath(new URL("../artifact/", import.meta.url));

test("npm package metadata identifies the public source repository", () => {
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/wrangler1024/grok-bot-cli.git",
  });
  assert.equal(
    packageJson.homepage,
    "https://github.com/wrangler1024/grok-bot-cli#readme",
  );
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/wrangler1024/grok-bot-cli/issues",
  });
});

test("the fork keeps upstream attribution and uses GitHub-only distribution", () => {
  assert.equal(packageJson.private, true);
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
  const release = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(readme, /https:\/\/github\.com\/ScriptedAlchemy\/grok-bot-cli/);
  assert.match(license, /Copyright \(c\) 2026 ScriptedAlchemy/);
  assert.match(release, /github\.repository == 'ScriptedAlchemy\/grok-bot-cli'/);
});

test("repository marketplaces install the committed artifact", () => {
  const claude = readJson("../.claude-plugin/marketplace.json");
  const codex = readJson("../.agents/plugins/marketplace.json");
  const cursor = readJson("../.cursor-plugin/marketplace.json");

  assert.equal(claude.plugins[0].source, "./artifact");
  assert.deepEqual(codex.plugins[0].source, {
    path: "./artifact",
    source: "local",
  });
  assert.equal(cursor.plugins[0].source, "./artifact");
});

test("committed artifact matches the complete source snapshot", async () => {
  const [source, artifact] = await Promise.all([
    inspect({ root: projectRoot }),
    readArtifactManifest(artifactRoot),
  ]);

  assert.equal(source.state, "ready");
  assert.equal(artifact.status, "ok");
  assert.deepEqual(
    artifact.manifest.compiler.project.sourceInputs,
    source.projectContext.sourceInputs,
  );
});
