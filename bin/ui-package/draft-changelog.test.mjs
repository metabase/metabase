import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { collectChanges, draftChangelog } from "./draft-changelog.mjs";

test("selects shipped UI changes after the release tag", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ui-changelog-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  function commit(path, content, subject) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
    git("add", path);
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      subject,
    );
  }
  git("init", "-q");
  commit(
    "frontend/ui-package/package.json",
    '{"version":"0.1.0"}',
    "Release UI",
  );
  assert.throws(() => collectChanges(root), /Cannot verify/);
  git("tag", "ui-v0.1.0");
  commit("frontend/src/metabase/ui/button.ts", "", "Update Button (#42)");
  commit("frontend/src/metabase/ui/button.unit.spec.tsx", "", "Test Button");
  commit(
    "frontend/src/metabase/utils/color-scheme.ts",
    "",
    "Fix the shared color scheme",
  );
  commit("src/unrelated.clj", "", "Fix unrelated service");
  assert.deepEqual(
    collectChanges(root).map(({ subject }) => subject),
    ["Fix the shared color scheme", "Update Button (#42)"],
  );
});

const changes = [{ sha: "a".repeat(40), subject: "Fix Button focus (#42)" }];
const result = (text) => async () =>
  Response.json({
    status: "completed",
    output: [{ content: [{ type: "output_text", text }] }],
  });

test("links a valid draft to the actual source", async () => {
  assert.equal(
    await draftChangelog(changes, "test", result("0\tFix Button focus.")),
    "Fix Button focus. ([#42](https://github.com/metabase/metabase/pull/42))",
  );
});

test("rejects out-of-range, empty, and link-injecting drafts", async () => {
  for (const text of [
    "9\tInvented change.",
    "",
    "0\tVisit https://example.com",
  ]) {
    await assert.rejects(
      draftChangelog(changes, "test", result(text)),
      /usable plain-text changelog/,
    );
  }
});
