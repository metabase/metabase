import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

function format(code, filename) {
  return execFileSync(
    process.execPath,
    ["node_modules/oxfmt/bin/oxfmt", "--stdin-filepath", filename],
    { cwd: root, input: code, encoding: "utf8", timeout: 60_000 },
  );
}

test("should group packages, aliases and relative imports", () => {
  assert.equal(
    format(
      'import sibling from "./sibling";\nimport internal from "metabase/lib";\nimport external from "react";\nimport builtin from "node:fs";\n',
      "frontend/src/metabase/example.ts",
    ),
    'import builtin from "node:fs";\n\nimport external from "react";\n\nimport internal from "metabase/lib";\n\nimport sibling from "./sibling";\n',
  );
});

test("should keep bare side-effect imports in their existing order", () => {
  const code = 'import "./z";\nimport "./a";\n';
  assert.equal(format(code, "frontend/src/metabase/example.ts"), code);
});

for (const filename of [
  "frontend/src/metabase/app-embed-sdk.tsx",
  "frontend/src/metabase/redux/store/mocks/api.ts",
  "enterprise/frontend/src/embedding-sdk-package/hooks/public/use-metabase-query/tests/use-metabase-query.unit.spec.tsx",
]) {
  test(`should format ${filename} while preserving import order`, () => {
    assert.equal(
      format(
        'import z from "z";\nimport a from "a";\nconst  value=1;',
        filename,
      ),
      'import z from "z";\nimport a from "a";\nconst value = 1;\n',
    );
  });
}
