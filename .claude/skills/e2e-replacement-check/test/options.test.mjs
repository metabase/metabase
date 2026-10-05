import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "../lib/options.mjs";

describe("parseArgs", () => {
  it("should leave automatic mutants off and cap backend breaks at 2 by default", () => {
    const { run } = parseArgs(["run"]);
    assert.equal(run.auto, false);
    assert.equal(run.autoLimit, 25);
    assert.equal(run.backendLimit, 2);
    assert.equal(run.related, true);
    assert.equal(run.relatedLimit, 10);
    assert.equal(run.typeCheck, true);
  });

  it("should turn on automatic mutants with --auto", () => {
    assert.equal(parseArgs(["run", "--auto"]).run.auto, true);
    assert.equal(parseArgs(["run", "--auto", "--auto-limit", "5"]).run.autoLimit, 5);
  });

  it("should raise the backend cap with --backend-limit", () => {
    assert.equal(parseArgs(["run", "--backend-limit", "5"]).run.backendLimit, 5);
  });

  it("should read paths and turn off the related specs and type check", () => {
    const opts = parseArgs(["run", "--breaks", "b.json", "--out", "/tmp/x", "--no-related", "--no-type-check"]);
    assert.equal(opts.breaks, "b.json");
    assert.equal(opts.out, "/tmp/x");
    assert.equal(opts.run.related, false);
    assert.equal(opts.run.typeCheck, false);
  });

  it("should refuse unknown arguments and bad numbers", () => {
    assert.throws(() => parseArgs(["run", "--fast"]), /unexpected argument --fast/);
    assert.throws(() => parseArgs(["run", "--backend-limit", "two"]), /whole number/);
    assert.throws(() => parseArgs(["run", "--breaks"]), /needs a value/);
  });
});
