import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  MAX_FORMULA_PROMPT_LENGTH,
  compileFormula,
  getFormulaRequest,
} from "./utils";

const STAGE_INDEX = -1;

function createQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function createQueryWithExpressions(names: string[]) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: names.map((name) => ({
          name,
          value: { type: "literal", value: 1 },
        })),
      },
    ],
  });
}

describe("getFormulaRequest", () => {
  it("names the columns as escaped references with their types in aggregation mode", () => {
    const result = getFormulaRequest(
      createQuery(),
      STAGE_INDEX,
      "values",
      "average order total",
    );

    expect(result).toMatchObject({
      status: "ok",
      request: {
        mode: "aggregation",
        prompt: "average order total",
        table_name: "Orders",
        database_id: SAMPLE_DB_ID,
        metrics: [],
        measures: [],
        columns: expect.arrayContaining([
          { name: "[Total]", type: "number" },
          { name: "[Created At]", type: "datetime" },
          { name: "[Product → Category]", type: "string" },
        ]),
      },
    });
  });

  it("uses expression mode for Group by", () => {
    const result = getFormulaRequest(
      createQuery(),
      STAGE_INDEX,
      "columns",
      "order year",
    );

    expect(result).toMatchObject({
      status: "ok",
      request: {
        mode: "expression",
        metrics: [],
        measures: [],
        columns: expect.arrayContaining([
          { name: "[Created At]", type: "datetime" },
        ]),
      },
    });
  });

  it("trims the prompt", () => {
    const result = getFormulaRequest(
      createQuery(),
      STAGE_INDEX,
      "values",
      `  ${"a".repeat(MAX_FORMULA_PROMPT_LENGTH)}  `,
    );

    expect(result).toMatchObject({
      status: "ok",
      request: { prompt: "a".repeat(MAX_FORMULA_PROMPT_LENGTH) },
    });
  });

  it("reports a prompt that's too long", () => {
    const result = getFormulaRequest(
      createQuery(),
      STAGE_INDEX,
      "values",
      "a".repeat(MAX_FORMULA_PROMPT_LENGTH + 1),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "AI generation isn't available because the description is longer than 500 characters.",
    });
  });

  it("reports too many columns", () => {
    const expressionNames = Array.from(
      { length: 200 },
      (_, index) => `Expression ${index}`,
    );

    const result = getFormulaRequest(
      createQueryWithExpressions(expressionNames),
      STAGE_INDEX,
      "columns",
      "order year",
    );

    expect(result).toEqual({
      status: "error",
      message:
        "AI generation isn't available because there are more than 200 columns.",
    });
  });

  it("reports a column name that's too", () => {
    const result = getFormulaRequest(
      createQueryWithExpressions(["a".repeat(300)]),
      STAGE_INDEX,
      "values",
      "average order total",
    );

    expect(result).toEqual({
      status: "error",
      message:
        "AI generation isn't available because a column name is longer than 255 characters.",
    });
  });
});

describe("compileFormula", () => {
  it("compiles a valid aggregation formula", () => {
    const result = compileFormula(
      createQuery(),
      STAGE_INDEX,
      "values",
      "Average([Total])",
      createSampleDatabase(),
    );

    expect(result.error).toBeNull();
    expect(result.expressionClause).not.toBeNull();
  });

  it("reports a formula that references an unknown column", () => {
    const result = compileFormula(
      createQuery(),
      STAGE_INDEX,
      "values",
      "Average([Unknown])",
      createSampleDatabase(),
    );

    expect(result.error?.message).toMatch(/Unknown/);
    expect(result.expressionClause).toBeNull();
  });

  it("rejects an aggregation in a Group by formula", () => {
    const result = compileFormula(
      createQuery(),
      STAGE_INDEX,
      "columns",
      "Sum([Total])",
      createSampleDatabase(),
    );

    expect(result.expressionClause).toBeNull();
  });
});
