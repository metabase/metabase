import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "../lib/options.mjs";
import { countsBySpec, perSpecHint, restrictToSpecs } from "../lib/scope.mjs";

const test = (spec, n, fate = "deleted") => ({ id: `${spec}::test ${n}`, spec, fate });
const DOCS = "e2e/test/scenarios/documents/documents.cy.spec.ts";
const COMMENTS = "e2e/test/scenarios/documents/comments.cy.spec.ts";
const removed = [
  ...Array.from({ length: 15 }, (_, i) => test(COMMENTS, i)),
  ...Array.from({ length: 8 }, (_, i) => test(DOCS, i)),
  test("e2e/test/scenarios/documents/old.cy.spec.ts", 0, `moved to ${DOCS} and shrunk`),
];

describe("--spec", () => {
  it("should accept repeated and comma-separated spec paths", () => {
    assert.deepEqual(parseArgs(["scope", "--spec", `${DOCS},${COMMENTS}`]).specs, [DOCS, COMMENTS]);
    assert.deepEqual(parseArgs(["scope", "--spec", DOCS, "--spec", COMMENTS]).specs, [DOCS, COMMENTS]);
    assert.deepEqual(parseArgs(["scope"]).specs, []);
  });

  it("should keep only the deleted and shrunk tests of the given spec files", () => {
    const kept = restrictToSpecs(removed, [`./${DOCS}`]);
    assert.equal(kept.length, 9);
    assert.ok(kept.every((t) => t.spec === DOCS || t.fate.startsWith(`moved to ${DOCS}`)));
  });

  it("should keep every test without --spec", () => {
    assert.equal(restrictToSpecs(removed, []).length, removed.length);
  });
});

describe("perSpecHint", () => {
  it("should suggest running per spec, with counts, when more than 20 tests are in scope", () => {
    const hint = perSpecHint({ specs: [], removed_tests: removed });
    assert.match(hint, /^This PR deletes or shrinks 24 e2e tests/);
    assert.match(hint, /--spec/);
    assert.deepEqual(countsBySpec(removed)[0], [COMMENTS, 15]);
    assert.match(hint, new RegExp(`15  ${COMMENTS}`));
  });

  it("should say nothing for a small PR or a run already limited with --spec", () => {
    assert.equal(perSpecHint({ specs: [], removed_tests: removed.slice(0, 20) }), null);
    assert.equal(perSpecHint({ specs: [DOCS], removed_tests: removed }), null);
  });
});
