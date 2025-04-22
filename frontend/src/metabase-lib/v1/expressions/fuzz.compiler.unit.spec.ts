import * as Lib from "metabase-lib";

import { compileExpression } from "./compiler";
import { fuzz } from "./test/fuzz";
import { generateExpression } from "./test/generator";
import { query, stageIndex } from "./test/shared";

const MAX_SEED = 10_000;

function compile(
  expression: string,
  expressionMode: Lib.ExpressionMode = "expression",
) {
  const columns = Lib.expressionableColumns(query, stageIndex);

  const result = compileExpression({
    source: expression,
    query,
    stageIndex,
    expressionMode,
    resolver() {
      return columns[0];
    },
  });
  if (result.error) {
    throw result.error;
  }
}

beforeAll(() => {
  console.warn = jest.fn();
});

describe("metabase-lib/v1/expressions/compiler", () => {
  // quick sanity check before the real fuzzing
  it("should parse custom expresssion", () => {
    expect(() => compile("CASE([Deal],[Price]*7e-1,[Price])")).not.toThrow();
  });
});

fuzz("FUZZING metabase-lib/v1/expressions/compiler", () => {
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
      expect(() => compile(expression, "filter")).not.toThrow();
    });
  }
});
