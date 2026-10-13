import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { applyTableFormula, initializeTableSummary } from "./table-formula";

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

  it("replaces the previous calculation without stacking aggregations", () => {
    const query = initializeTableSummary(setup()).query();
    const result = applyTableFormula(query, "AVG(Price)");
    expect(result.error).toBeNull();
    expect(result.query && Lib.aggregations(result.query, -1)).toHaveLength(1);
  });
});
