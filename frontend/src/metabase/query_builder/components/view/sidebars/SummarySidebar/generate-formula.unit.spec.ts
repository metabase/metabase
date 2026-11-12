import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import { createMockCard, createMockMeasure } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  addFormula,
  compileFormula,
  getFormulaReferences,
  getFormulaRequest,
} from "./generate-formula";
import { getDimensionItems, getValueItems } from "./utils";

const STAGE_INDEX = -1;

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function createOrdersQueryWithMetricAndMeasure() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue [USD]",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", fieldId: ORDERS.SUBTOTAL }],
            },
          ],
        },
      ],
    }),
  });
  const measure = createMockMeasure({
    id: 1,
    name: "Order count",
    table_id: ORDERS_ID,
    definition: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count" }],
        },
      ],
    }),
  });
  const provider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [metric],
      measures: [measure],
    }),
  });
  return Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

describe("getFormulaReferences", () => {
  it("lists the columns as escaped references with type hints", () => {
    const references = getFormulaReferences(
      createOrdersQuery(),
      STAGE_INDEX,
      "expression",
    );

    expect(references?.columns).toEqual(
      expect.arrayContaining([
        { name: "[Total]", type: "number" },
        { name: "[Created At]", type: "date" },
        { name: "[Product → Category]", type: "text" },
      ]),
    );
    expect(references).toMatchObject({
      table_name: "Orders",
      database_id: SAMPLE_DB_ID,
    });
  });

  it("lists metrics and measures as escaped references in aggregation mode", () => {
    const references = getFormulaReferences(
      createOrdersQueryWithMetricAndMeasure(),
      STAGE_INDEX,
      "aggregation",
    );

    expect(references).toMatchObject({
      metrics: ["[Revenue \\[USD\\]]"],
      measures: ["[Order count]"],
    });
  });

  it("leaves out metrics and measures in expression mode", () => {
    const references = getFormulaReferences(
      createOrdersQueryWithMetricAndMeasure(),
      STAGE_INDEX,
      "expression",
    );

    expect(references).toMatchObject({ metrics: [], measures: [] });
  });
});

describe("getFormulaRequest", () => {
  it("sends the trimmed prompt in the well's mode", () => {
    const references = getFormulaReferences(
      createOrdersQuery(),
      STAGE_INDEX,
      "aggregation",
    );
    if (!references) {
      throw new Error("Expected references");
    }

    expect(
      getFormulaRequest(references, "  average total  ", "aggregation"),
    ).toEqual({
      ...references,
      mode: "aggregation",
      prompt: "average total",
    });
  });

  it("caps the prompt at the length the endpoint accepts", () => {
    const references = getFormulaReferences(
      createOrdersQuery(),
      STAGE_INDEX,
      "aggregation",
    );
    if (!references) {
      throw new Error("Expected references");
    }

    const request = getFormulaRequest(
      references,
      "a".repeat(600),
      "aggregation",
    );

    expect(request.prompt).toHaveLength(500);
  });
});

describe("compileFormula", () => {
  it("compiles an aggregation in aggregation mode", () => {
    const result = compileFormula(
      createOrdersQuery(),
      STAGE_INDEX,
      "aggregation",
      "Average([Total])",
      createSampleDatabase(),
    );

    expect(result.error).toBeNull();
  });

  it("rejects an aggregation in expression mode", () => {
    const result = compileFormula(
      createOrdersQuery(),
      STAGE_INDEX,
      "expression",
      "Average([Total])",
      createSampleDatabase(),
    );

    expect(result.error).not.toBeNull();
  });

  it("rejects a column that doesn't exist", () => {
    const result = compileFormula(
      createOrdersQuery(),
      STAGE_INDEX,
      "expression",
      "[Nope] * 2",
      createSampleDatabase(),
    );

    expect(result.error?.message).toBe("Unknown column: Nope");
  });
});

describe("addFormula", () => {
  it("adds a named aggregation to Summarize by", () => {
    const query = createOrdersQuery();
    const { expressionClause } = compileFormula(
      query,
      STAGE_INDEX,
      "aggregation",
      "Average([Total])",
      createSampleDatabase(),
    );
    if (!expressionClause) {
      throw new Error("Expected the formula to compile");
    }

    const nextQuery = addFormula(
      query,
      STAGE_INDEX,
      "values",
      "Average total",
      expressionClause,
    );

    expect(
      getValueItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
    ).toEqual(["Average total"]);
  });

  it("groups by a new custom column in Group by", () => {
    const query = createOrdersQuery();
    const { expressionClause } = compileFormula(
      query,
      STAGE_INDEX,
      "expression",
      "year([Created At])",
      createSampleDatabase(),
    );
    if (!expressionClause) {
      throw new Error("Expected the formula to compile");
    }

    const nextQuery = addFormula(
      query,
      STAGE_INDEX,
      "columns",
      "Year created",
      expressionClause,
    );

    expect(
      getDimensionItems(nextQuery, STAGE_INDEX).map(({ label }) => label),
    ).toEqual(["Year created"]);
  });
});
