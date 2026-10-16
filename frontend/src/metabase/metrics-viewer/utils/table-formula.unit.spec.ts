import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  applyTableFormula,
  applyTableFormulaList,
  initializeTableSummary,
  splitFormulaList,
  tableFormulaReferences,
} from "./table-formula";

const PRODUCT_METRIC_ID = 101;
const ORDER_METRIC_ID = 102;

function createMetricsMetadata() {
  return createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createProductsTable({
            metrics: [
              createMockCard({
                id: PRODUCT_METRIC_ID,
                name: "Average product price",
                type: "metric",
                table_id: PRODUCTS_ID,
                dataset_query: createMockStructuredDatasetQuery({
                  query: {
                    "source-table": PRODUCTS_ID,
                    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
                  },
                }),
              }),
            ],
          }),
          createOrdersTable({
            metrics: [
              createMockCard({
                id: ORDER_METRIC_ID,
                name: "Order revenue",
                type: "metric",
                table_id: ORDERS_ID,
                dataset_query: createMockStructuredDatasetQuery({
                  query: {
                    "source-table": ORDERS_ID,
                    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
                  },
                }),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function setup() {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID },
      },
    }),
    SAMPLE_METADATA,
  );
}

describe("table formulas", () => {
  it("starts with Sum of Price instead of the numeric ID", () => {
    const question = initializeTableSummary(setup());
    const query = question.query();
    expect(
      Lib.displayInfo(query, -1, Lib.aggregations(query, -1)[0]).displayName,
    ).toContain("Price");
  });

  it("falls back to Count when there are no numeric value columns", () => {
    const table = createProductsTable();
    const metadata = createMockMetadata({
      databases: [
        createSampleDatabase({
          tables: [
            createProductsTable({
              fields: table.fields?.filter((field) =>
                ["ID", "CATEGORY"].includes(field.name),
              ),
            }),
          ],
        }),
      ],
    });
    const question = initializeTableSummary(
      new Question(setup().card(), metadata),
    );
    expect(Lib.toLegacyQuery(question.query())).toMatchObject({
      query: { aggregation: [["count"]] },
    });
  });

  it("preserves other calculations when editing an existing summary", () => {
    const query = Lib.aggregateByCount(
      initializeTableSummary(setup()).query(),
      -1,
    );
    const result = applyTableFormula(query, "AVG(Price)");
    expect(result.error).toBeNull();
    expect(result.query && Lib.toLegacyQuery(result.query)).toMatchObject({
      query: {
        aggregation: [["avg", expect.anything()], ["count"]],
      },
    });
  });

  it("accepts case-insensitive formulas and aggregate arithmetic", () => {
    const result = applyTableFormula(setup().query(), "SUM(price) / COUNT()");
    expect(result.error).toBeNull();
    expect(result.query && Lib.aggregations(result.query, -1)).toHaveLength(1);
  });

  it.each(["SUM(nope)", "Price", "SUM(", "SUM(Category)", "[Product count]"])(
    "rejects invalid or non-column formula %s",
    (source) => {
      expect(applyTableFormula(setup().query(), source).error).toBeTruthy();
    },
  );

  it("accepts saved metrics from the same table, alone or in arithmetic", () => {
    const query = new Question(setup().card(), createMetricsMetadata()).query();
    expect(tableFormulaReferences(query)).toHaveLength(1);

    const result = applyTableFormula(
      query,
      "[Average product price] / Sum(Price)",
    );
    expect(result.error).toBeNull();
    expect(result.query && Lib.toLegacyQuery(result.query)).toMatchObject({
      query: {
        aggregation: [
          [
            "/",
            ["metric", PRODUCT_METRIC_ID],
            ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
          ],
        ],
      },
    });
  });

  it("rejects saved metrics from other tables", () => {
    const query = new Question(setup().card(), createMetricsMetadata()).query();
    expect(applyTableFormula(query, "[Order revenue]").error).toBeTruthy();
  });

  it("replaces the previous calculation without stacking aggregations", () => {
    const query = initializeTableSummary(setup()).query();
    const result = applyTableFormula(query, "AVG(Price)");
    expect(result.error).toBeNull();
    expect(result.query && Lib.aggregations(result.query, -1)).toHaveLength(1);
  });

  it("splits formula lists on top-level commas only", () => {
    expect(
      splitFormulaList(
        'Sum([Price]), Percentile([Price], 0.9) , [A, B], "x, y",',
      ),
    ).toEqual(["Sum([Price])", "Percentile([Price], 0.9)", "[A, B]", '"x, y"']);
  });

  it("replaces every calculation with the formulas in a list, keeping groupings", () => {
    const query = Lib.toLegacyQuery(
      applyTableFormulaList(
        new Question(
          createMockCard({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": PRODUCTS_ID,
                aggregation: [["count"]],
                breakout: [["field", PRODUCTS.CATEGORY, null]],
              },
            },
          }),
          SAMPLE_METADATA,
        ).query(),
        "Sum(Price), Average(Price)",
      ).query ?? setup().query(),
    );
    expect(query).toMatchObject({
      query: {
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, expect.anything()]],
          ["avg", ["field", PRODUCTS.PRICE, expect.anything()]],
        ],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });
  });

  it("reports which formula in a list fails", () => {
    expect(
      applyTableFormulaList(setup().query(), "Count(), SUM(nope)"),
    ).toEqual({ query: null, error: "Calculation 2: Unknown column: nope" });
    expect(applyTableFormulaList(setup().query(), " , ").error).toBeTruthy();
  });
});
