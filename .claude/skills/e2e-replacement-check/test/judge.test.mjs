import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { judge } from "../lib/judge.mjs";

const ID = "a.unit.spec.ts::a test";
const clean = new Map([[ID, "passed"]]);
const failed = (kind) => ({ status: "failed", kind });
const passed = { status: "passed" };
const missing = { status: "missing" };
const run = (broken, rerun, cleanRerun) =>
  judge({
    clean,
    broken: new Map([[ID, broken]]),
    rerun: rerun && new Map([[ID, rerun]]),
    cleanRerun: cleanRerun && new Map([[ID, cleanRerun]]),
  });

describe("judge", () => {
  it("should count an assertion failure that reproduces and passes on clean code as caught", () => {
    assert.deepEqual(run(failed("assertion"), failed("assertion"), passed).caught_by, [ID]);
  });

  it("should count a passing test as ran and not caught", () => {
    const j = run(passed);
    assert.deepEqual(j.ran, [ID]);
    assert.deepEqual(j.caught_by, []);
  });

  it("should count an error from product code as errored, not caught", () => {
    const j = run(failed("product-exception"), failed("product-exception"), passed);
    assert.deepEqual(j.errored, [ID]);
    assert.deepEqual(j.caught_by, []);
  });

  it("should count a failure that passes on rerun as errored", () => {
    assert.equal(run(failed("assertion"), passed, passed).failures[ID].reason, "not reproduced on rerun");
  });

  it("should leave a failure unconfirmed when its rerun or clean rerun produced no result", () => {
    assert.equal(run(failed("assertion"), missing).failures[ID].reason, "rerun didn't finish");
    assert.equal(run(failed("assertion"), failed("assertion"), missing).failures[ID].reason, "clean rerun didn't finish");
  });

  it("should count a failure that also fails on a clean rerun as errored", () => {
    assert.equal(run(failed("assertion"), failed("assertion"), failed("assertion")).failures[ID].reason, "fails on a clean rerun");
  });

  it("should leave out tests that didn't pass on clean code", () => {
    const j = judge({ clean: new Map([[ID, "failed"]]), broken: new Map([[ID, failed("assertion")]]) });
    assert.deepEqual(j.ran, []);
  });
});
