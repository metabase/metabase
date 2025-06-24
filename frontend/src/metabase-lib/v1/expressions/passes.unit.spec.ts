import type { Expression } from "metabase-types/api";

import {
  adjustCaseOrIf,
  adjustMultiArgOptions,
  adjustOffset,
  adjustOptions,
} from "./passes";

const a: Expression = ["field", 1];
const b: Expression = ["field", 2];
const c: Expression = ["field", 1];
const d: Expression = ["field", 2];

describe("adjustCaseOrIf", () => {
  it("should group case pairs", () => {
    expect(adjustCaseOrIf(["case", a, b])).toEqual(["case", [[a, b]]]);
    expect(adjustCaseOrIf(["case", a, b, c, d])).toEqual([
      "case",
      [
        [a, b],
        [c, d],
      ],
    ]);
    expect(adjustCaseOrIf(["case", a, b, c])).toEqual([
      "case",
      [[a, b]],
      { default: c },
    ]);
  });

  it("should group if pairs", () => {
    expect(adjustCaseOrIf(["if", a, b])).toEqual(["if", [[a, b]]]);
    expect(adjustCaseOrIf(["if", a, b, c, d])).toEqual([
      "if",
      [
        [a, b],
        [c, d],
      ],
    ]);
    expect(adjustCaseOrIf(["if", a, b, c])).toEqual([
      "if",
      [[a, b]],
      { default: c },
    ]);
  });

  it("should leave other expressions untouched", () => {
    const expressions: Expression[] = [
      42,
      "foo",
      true,
      ["value", 42],
      ["count"],
      ["concat", "foo", "bar"],
    ];
    for (const expression of expressions) {
      expect(adjustCaseOrIf(expression)).toEqual(expression);
    }
  });
});

describe("adjustOffset", () => {
  it("should add options to offset", () => {
    expect(adjustOffset(["offset", a, -1])).toEqual(["offset", {}, a, -1]);
  });

  it("should not add options when it is set already", () => {
    expect(adjustOffset(["offset", {}, a, -1])).toEqual(["offset", {}, a, -1]);
  });

  it("should leave other expressions untouched", () => {
    const expressions: Expression[] = [
      42,
      "foo",
      true,
      ["value", 42],
      ["count"],
      ["concat", "foo", "bar"],
    ];
    for (const expression of expressions) {
      expect(adjustOffset(expression)).toEqual(expression);
    }
  });
});

describe("adjustOptions", () => {
  it("should replace case-insensitive", () => {
    expect(adjustOptions(["contains", a, "foo", "case-insensitive"])).toEqual([
      "contains",
      a,
      "foo",
      { "case-sensitive": false },
    ]);
    expect(adjustOptions(["contains", a, "foo"])).toEqual([
      "contains",
      a,
      "foo",
    ]);
  });

  it("should replace include-current", () => {
    // HACK: there is no documented clause that uses this argument
    expect(adjustOptions(["contains", a, "foo", "include-current"])).toEqual([
      "contains",
      a,
      "foo",
      { "include-current": true },
    ]);
  });
});

describe("adjustMultiArgOptions", () => {
  it("should adjust options object for multiple arguments", () => {
    expect(adjustMultiArgOptions(["starts-with", a, "foo", b, "bar"])).toEqual([
      "starts-with",
      {},
      a,
      "foo",
      b,
      "bar",
    ]);

    expect(adjustMultiArgOptions(["starts-with", a, "foo", b, {}])).toEqual([
      "starts-with",
      {},
      a,
      "foo",
      b,
    ]);
  });

  it("should not adjust options object for clauses that have it in the right position already", () => {
    expect(
      adjustMultiArgOptions([
        "starts-with",
        { "case-sensitive": false },
        a,
        "foo",
      ]),
    ).toEqual([
      "starts-with",
      {
        "case-sensitive": false,
      },
      a,
      "foo",
    ]);
  });

  it("should leave other expressions untouched", () => {
    expect(adjustMultiArgOptions(["starts-with", a, "foo"])).toEqual([
      "starts-with",
      a,
      "foo",
    ]);
    expect(adjustMultiArgOptions(["starts-with", a, "foo"])).toEqual([
      "starts-with",
      a,
      "foo",
    ]);
  });
});
