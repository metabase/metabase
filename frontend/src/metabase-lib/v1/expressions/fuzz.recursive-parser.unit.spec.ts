import process from "process";
import _ from "underscore";

import { parse } from "./recursive-parser";
import { generateExpression } from "./test/generator";

const fuzz = process.env.MB_FUZZ ? describe : _.noop;

describe("metabase-lib/v1/expressions/recursive-parser", () => {
  // quick sanity check before the real fuzzing
  it("should parse custom expresssion", () => {
    expect(() => parse("CASE([Deal],[Price]*7e-1,[Price])")).not.toThrow();
  });
});

fuzz("FUZZING metabase-lib/v1/expressions/recursive-parser", () => {
  for (let seed = 1; seed < 1e4; ++seed) {
    it("should parse generated number expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "number");
      expect(() => parse(expression)).not.toThrow();
    });

    it("should parse generated string expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "string");
      expect(() => parse(expression)).not.toThrow();
    });

    it("should parse generated boolean expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "boolean");
      expect(() => parse(expression)).not.toThrow();
    });
  }
});
