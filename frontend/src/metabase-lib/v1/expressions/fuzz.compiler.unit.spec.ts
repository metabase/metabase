import process from "process";
import _ from "underscore";

import { query } from "./__support__/shared";
import { compileExpression } from "./compiler";
import { generateExpression } from "./test/generator";

jest.mock("metabase-lib", () => {
  const mod = jest.requireActual("metabase-lib");
  return {
    ...mod,
    expressionClauseForLegacyExpression() {
      return null;
    },
  };
});

const fuzz = process.env.MB_FUZZ ? describe : _.noop;
const MAX_SEED = 10_000;

function compile(expression: string, startRule: string = "expression") {
  const result = compileExpression({
    source: expression,
    query,
    stageIndex: -1,
    startRule,
    resolve: false,
  });
  if ("error" in result) {
    throw result.error;
  }
}

describe("metabase-lib/v1/expressions/compiler", () => {
  // quick sanity check before the real fuzzing
  it("should parse custom expresssion", () => {
    expect(() => compile("CASE([Deal],[Price]*7e-1,[Price])")).not.toThrow();
  });
});

fuzz("FUZZING metabase-lib/v1/expressions/recursive-parser", () => {
  for (let seed = 1; seed < MAX_SEED; ++seed) {
    it("should parse generated number expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "number");
      expect(() => compile(expression)).not.toThrow();
    });

    it("should parse generated string expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "string");
      expect(() => compile(expression)).not.toThrow();
    });

    it("should parse generated boolean expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "boolean");
      expect(() => compile(expression, "boolean")).not.toThrow();
    });
  }
});
