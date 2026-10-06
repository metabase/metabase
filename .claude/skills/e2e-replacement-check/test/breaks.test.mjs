import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { prepareBreaks } from "../lib/breaks.mjs";
import { repoRoot } from "../lib/git.mjs";
import { loadTypescript } from "../lib/scope.mjs";

const ts = loadTypescript(repoRoot(process.cwd()));
const scope = { removed_tests: [{ id: "e2e/test/a.cy.spec.js::does a thing" }] };
let root;

before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rc-breaks-")));
  const git = (...args) => spawnSync("git", args, { cwd: root });
  git("init", "-q");
  const files = {
    "frontend/src/thing.ts": "export function f() {\n  return 1;\n}\nexport const twice = 'x';\nexport const again = 'x';\n",
    "frontend/src/thing.unit.spec.ts": "it('works', () => {});\n",
    "src/metabase/thing.clj": "(ns metabase.thing)\n(defn f [] 1)\n",
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  git("add", ".");
  git("-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-qm", "init");
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

const prepare = (edits) => prepareBreaks({ root, ts, scope, raw: { breaks: [{ test: scope.removed_tests[0].id, break: "b", kind: "remove", edits }] } })[0];

describe("prepareBreaks", () => {
  it("should turn a find-and-replace edit into a patch and the changed lines", () => {
    const b = prepare([{ file: "frontend/src/thing.ts", find: "  return 1;\n", replace: "  return 2;\n" }]);
    assert.equal(b.unmeasured, undefined);
    assert.equal(b.lang, "frontend");
    assert.deepEqual(b.changes[0].lines, [[2, 2]]);
    assert.match(b.changes[0].patch, /^-  return 1;$/m);
    assert.match(b.changes[0].patch, /^\+  return 2;$/m);
    assert.equal(b.test_known, true);
  });

  it("should keep the removed assertion a break names", () => {
    const [b] = prepareBreaks({
      root,
      ts,
      scope,
      raw: { breaks: [{ test: scope.removed_tests[0].id, assertion: 'cy.url().should("equal", url)', break: "b", kind: "block", edits: [{ file: "frontend/src/thing.ts", find: "  return 1;\n", replace: "  return 2;\n" }] }] },
    });
    assert.equal(b.assertion, 'cy.url().should("equal", url)');
  });

  it("should leave a break unmeasured when its find text is missing or not unique", () => {
    assert.match(prepare([{ file: "frontend/src/thing.ts", find: "nope", replace: "" }]).unmeasured, /isn't in/);
    assert.match(prepare([{ file: "frontend/src/thing.ts", find: "= 'x';", replace: "= 'y';" }]).unmeasured, /more than once/);
  });

  it("should refuse edits to test files", () => {
    assert.match(prepare([{ file: "frontend/src/thing.unit.spec.ts", find: "works", replace: "fails" }]).unmeasured, /test code/);
  });

  it("should refuse a break that doesn't parse", () => {
    assert.match(prepare([{ file: "frontend/src/thing.ts", find: "  return 1;\n", replace: "  return (1;\n" }]).unmeasured, /doesn't parse/);
  });

  it("should refuse a break that edits both sides", () => {
    const b = prepare([
      { file: "frontend/src/thing.ts", find: "  return 1;\n", replace: "  return 2;\n" },
      { file: "src/metabase/thing.clj", find: "(defn f [] 1)", replace: "(defn f [] 2)" },
    ]);
    assert.match(b.unmeasured, /split it/);
  });

  it("should refuse paths outside the repo", () => {
    assert.match(prepare([{ file: "../etc/passwd", find: "a", replace: "b" }]).unmeasured, /isn't a path inside the repo/);
  });
});
