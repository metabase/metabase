import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const binary =
  process.env.METABASE_OXLINT_BINARY ?? "node_modules/oxlint/bin/oxlint";

function nativeDiagnostics(source, rules) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "metabase-native-"));
  try {
    const file = path.join(directory, "fixture.tsx");
    const config = path.join(directory, "config.json");
    fs.writeFileSync(file, source);
    fs.writeFileSync(
      config,
      JSON.stringify({ categories: { correctness: "off" }, rules }),
    );
    const result = spawnSync(
      process.execPath,
      [
        binary,
        "--config",
        config,
        "--disable-nested-config",
        "--format",
        "json",
        file,
      ],
      { encoding: "utf8" },
    );
    assert.ifError(result.error);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(result.stdout).diagnostics;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("native unused-vars recognizes JSX references without react/jsx-uses-vars", () => {
  const source = `
    import { Used, Unused } from "components";
    import * as UI from "components";
    export const Example = () => <><Used /><UI.Button /></>;
  `;
  const diagnostics = nativeDiagnostics(source, { "no-unused-vars": "error" });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Unused/);
  assert.equal(diagnostics[0].code, "eslint(no-unused-vars)");
});
