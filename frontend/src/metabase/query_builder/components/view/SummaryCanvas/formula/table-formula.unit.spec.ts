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
  compileFormula,
  getColumnFormula,
  getDefaultFormula,
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

function toLegacyAggregation(query: Lib.Query, source: string) {
  const { clause, error } = compileFormula(query, source);
  expect(error).toBeNull();
  return clause && Lib.toLegacyQuery(Lib.aggregate(query, -1, clause));
}

describe("table formulas", () => {
  it("starts with Sum of Price instead of the numeric ID", () => {
    expect(getDefaultFormula(setup().query())).toBe("Sum([Price])");
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
    const query = new Question(setup().card(), metadata).query();
    expect(getDefaultFormula(query)).toBe("Count()");
  });

  it("sums numbers and counts distinct values of other dropped columns", () => {
    const query = setup().query();
    const columns = Lib.breakoutableColumns(query, -1);
    const findColumn = (name: string) =>
      columns.find(
        (column) => Lib.displayInfo(query, -1, column).name === name,
      );
    const price = findColumn("PRICE");
    const category = findColumn("CATEGORY");
    expect(price && getColumnFormula(query, price)).toBe("Sum([Price])");
    expect(category && getColumnFormula(query, category)).toBe(
      "Distinct([Category])",
    );
  });

  it("accepts case-insensitive formulas and aggregate arithmetic", () => {
    expect(
      toLegacyAggregation(setup().query(), "SUM(price) / COUNT()"),
    ).toMatchObject({
      query: {
        aggregation: [["/", ["sum", expect.anything()], ["count"]]],
      },
    });
  });

  it.each([
    "SUM(nope)",
    "Price",
    "SUM(",
    "SUM(Category)",
    "[Product count]",
    "",
  ])("rejects invalid or non-column formula %p", (source) => {
    expect(compileFormula(setup().query(), source).error).toBeTruthy();
  });

  it("accepts saved metrics from the same table, alone or in arithmetic", () => {
    const query = new Question(setup().card(), createMetricsMetadata()).query();
    expect(tableFormulaReferences(query)).toHaveLength(1);

    expect(
      toLegacyAggregation(query, "[Average product price] / Sum(Price)"),
    ).toMatchObject({
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
    expect(compileFormula(query, "[Order revenue]").error).toBeTruthy();
  });
});
