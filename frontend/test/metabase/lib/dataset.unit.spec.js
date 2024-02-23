import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const productsTable = metadata.table(PRODUCTS_ID);

describe("metabase/util/dataset", () => {
  describe("syncColumnsAndSettings", () => {
    it("should automatically add new metrics when a new aggregrate column is added", () => {
      const prevQuestion = productsTable
        .legacyQuery({
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count"],
        });

      const newQuestion = prevQuestion
        .legacyQuery({ useStructuredQuery: true })
        .aggregate(["sum", ["field", PRODUCTS.PRICE, null]])
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject([
        "count",
        "sum",
      ]);
    });

    it("should automatically remove metrics from settings when an aggregrate column is removed", () => {
      const prevQuestion = productsTable
        .legacyQuery({
          aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        })
        .question()
        .setSettings({
          "graph.metrics": ["count", "sum"],
        });

      const newQuestion = prevQuestion
        .legacyQuery({ useStructuredQuery: true })
        .removeAggregation(1)
        .question()
        .syncColumnsAndSettings(prevQuestion);

      expect(newQuestion.setting("graph.metrics")).toMatchObject(["sum"]);
    });
  });
});
