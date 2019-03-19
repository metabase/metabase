// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
  metadata,
  question,
  DATABASE_ID,
  ANOTHER_DATABASE_ID,
  ORDERS_TABLE_ID,
  PRODUCT_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  MAIN_METRIC_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
  makeDatasetQuery,
} from "__support__/sample_dataset_fixture";

import Segment from "metabase-lib/lib/metadata/Segment";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

function makeQuery(query) {
  return new StructuredQuery(question, makeDatasetQuery(query));
}

describe("StructuredQuery nesting", () => {
  describe("nest", () => {
    it("", () => {
      const q = makeQuery({ "source-table": ORDERS_TABLE_ID });
      expect(q.query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      expect(q.nest().query()).toEqual({
        "source-query": { "source-table": ORDERS_TABLE_ID },
      });
    });

    it("should be able to modify the outer question", () => {
      const q = makeQuery({ "source-table": ORDERS_TABLE_ID });
      expect(
        q
          .nest()
          .addFilter(["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42])
          .query(),
      ).toEqual({
        "source-query": { "source-table": ORDERS_TABLE_ID },
        filter: ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
      });
    });

    it("should be able to modify the source question", () => {
      const q = makeQuery({ "source-table": ORDERS_TABLE_ID });
      expect(
        q
          .nest()
          .sourceQuery()
          .addFilter(["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42])
          .parentQuery()
          .query(),
      ).toEqual({
        "source-query": {
          "source-table": ORDERS_TABLE_ID,
          filter: ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
        },
      });
    });

    it("should return a table with correct dimensions", () => {
      const q = makeQuery({
        "source-table": ORDERS_TABLE_ID,
        aggregation: ["count"],
        breakout: [["field-id", ORDERS_PRODUCT_FK_FIELD_ID]],
      });
      expect(
        q
          .nest()
          .filterFieldOptions()
          .dimensions.map(d => d.mbql()),
      ).toEqual([
        ["field-literal", "PRODUCT_ID", "type/Integer"],
        ["field-literal", "count", "type/Number"],
      ]);
    });
  });
});
