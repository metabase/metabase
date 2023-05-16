import {
  SAMPLE_DATABASE,
  ORDERS,
  PEOPLE,
} from "__support__/sample_database_fixture";

import StructuredQuery, {
  isDimensionOption,
  DimensionOption,
  SegmentOption,
} from "metabase-lib/queries/StructuredQuery";
import Filter from "metabase-lib/queries/structured/Filter";

import {
  fixBetweens,
  hasBackwardsArguments,
  swapFilterArguments,
  handleEmptyBetween,
  getSearchHits,
} from "./utils";

const makeQuery = (query = {}): StructuredQuery => {
  return new StructuredQuery(ORDERS.question(), {
    type: "query",
    database: SAMPLE_DATABASE?.id,
    query: {
      "source-table": ORDERS.id,
      ...query,
    },
  });
};

const query = makeQuery();

describe("BulkFilterModal utils", () => {
  describe("hasBackwardsArguments", () => {
    it("flags between filters with misordered arguments", () => {
      const filter = new Filter([
        "between",
        ["field", ORDERS.fields?.[1].id, null],
        20,
        10,
      ]);

      const isBackwards = hasBackwardsArguments(filter);
      expect(isBackwards).toBe(true);
    });

    it("hasBackwardsArguments identifies between filters with correctly ordered arguments", () => {
      const filter = new Filter([
        "between",
        ["field", ORDERS.fields?.[1].id, null],
        20,
        100,
      ]);

      const isBackwards = hasBackwardsArguments(filter);
      expect(isBackwards).toBe(false);
    });
  });

  describe("swapFilterArguments", () => {
    it("swaps arguments in a between filter", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], 20, 10],
        null,
        query,
      );
      filter.add();

      const newQuery = swapFilterArguments(filter);
      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([10, 20]);
    });
  });

  describe("handleEmptyBetween", () => {
    it("replaces a between filter with an empty second argument with a >= filter", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], 20, null],
        null,
        query,
      );
      const newQuery = handleEmptyBetween(filter);

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([20]);
      expect(newFilter.operatorName()).toEqual(">=");
    });

    it("replaces a between filter with an empty first argument with a <= filter", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], undefined, 30],
        null,
        query,
      );
      const newQuery = handleEmptyBetween(filter);

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([30]);
      expect(newFilter.operatorName()).toEqual("<=");
    });
  });

  describe("fixBetweens", () => {
    it("handles empty between filters", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], 30, null],
        null,
        query,
      );
      const newQuery = fixBetweens(filter.add());

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([30]);
      expect(newFilter.operatorName()).toEqual(">=");
    });

    it("handles backwards between filters", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], 30, 20],
        null,
        query,
      );
      const newQuery = fixBetweens(filter.add());

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([20, 30]);
      expect(newFilter.operatorName()).toEqual("between");
    });

    it("ignores valid between filters", () => {
      const filter = new Filter(
        ["between", ["field", ORDERS.fields?.[1].id, null], 40, 50],
        null,
        query,
      );
      const newQuery = fixBetweens(filter.add());

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([40, 50]);
      expect(newFilter.operatorName()).toEqual("between");
    });

    it("ignores non-between filters", () => {
      const filter = new Filter(
        ["=", ["field", ORDERS.fields?.[1].id, null], 40, 50],
        null,
        query,
      );
      const newQuery = fixBetweens(filter.add());

      const newFilter = newQuery.filters()[0];
      expect(newFilter.arguments()).toEqual([40, 50]);
      expect(newFilter.operatorName()).toEqual("=");
    });

    it("ignores between custom expressions", () => {
      const filter = new Filter(
        [
          "between",
          ["field", ORDERS.CREATED_AT.id, null],
          ["field", PEOPLE.BIRTH_DATE.id, { "source-field": PEOPLE.ID.id }],
          ["field", PEOPLE.CREATED_AT.id, { "source-field": PEOPLE.ID.id }],
        ],
        null,
        query,
      );

      const newQuery = fixBetweens(filter.add());
      const newFilter = newQuery.filters()[0];

      expect(newFilter).toEqual(filter);
    });

    it("handles multiple invalid between filters", () => {
      const testQuery = makeQuery({
        filter: [
          "and",
          ["between", ["field", ORDERS.fields?.[1].id, null], 80, 50],
          ["between", ["field", ORDERS.fields?.[1].id, null], 30, null],
          ["=", ["field", ORDERS.fields?.[1].id, null], 8, 9, 7],
        ],
      });

      const fixedQuery = fixBetweens(testQuery);

      const [newFilter1, newFilter2, newFilter3] = fixedQuery.filters();
      expect(newFilter1.arguments()).toEqual([50, 80]);
      expect(newFilter1.operatorName()).toEqual("between");

      expect(newFilter2.arguments()).toEqual([30]);
      expect(newFilter2.operatorName()).toEqual(">=");

      expect(newFilter3.arguments()).toEqual([8, 9, 7]);
      expect(newFilter3.operatorName()).toEqual("=");
    });
  });

  describe("getSearchHits", () => {
    const query = makeQuery();
    const sections = query.topLevelFilterFieldOptionSections();

    const getHitFieldNames = (
      hits: (DimensionOption | SegmentOption)[] | null,
    ) => hits?.map(i => isDimensionOption(i) && i?.dimension?.displayName());

    it("hits on a field name", () => {
      const hits = getSearchHits("product", sections);
      const hitFieldNames = getHitFieldNames(hits);

      expect(hitFieldNames).toEqual(["Product ID"]);
    });

    it("hits on field names regardless of case", () => {
      const hits = getSearchHits("toTA", sections);
      const hitFieldNames = getHitFieldNames(hits);

      expect(hitFieldNames).toEqual(["Subtotal", "Total"]);
    });

    it("hits on field names from multiple tables", () => {
      const hits = getSearchHits("ID", sections);
      const hitFieldNames = getHitFieldNames(hits);

      expect(hitFieldNames).toEqual([
        "ID",
        "Product ID",
        "User ID",
        "ID",
        "ID",
      ]);
    });
  });
});
