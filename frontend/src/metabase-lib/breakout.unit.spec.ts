import { createQuery, columnFinder } from "./test-helpers";
import * as ML from "./v2";

describe("breakout", () => {
  describe("add breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      ML.breakoutableColumns(query),
    );

    it("should handle no breakout clauses", () => {
      expect(ML.breakouts(query)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");
      const nextQuery = ML.breakout(query, productTitle);
      const breakouts = ML.breakouts(nextQuery);

      expect(breakouts).toHaveLength(1);
      expect(ML.displayName(nextQuery, breakouts[0])).toBe("Title");
    });

    it("should preserve breakout positions between v1-v2 roundtrip", () => {
      const query = createQuery();
      const taxColumn = findBreakoutableColumn("ORDERS", "TAX");
      const nextQuery = ML.breakout(query, taxColumn);
      const nextQueryColumns = ML.breakoutableColumns(nextQuery);
      const nextTaxColumn = columnFinder(nextQuery, nextQueryColumns)(
        "ORDERS",
        "TAX",
      );

      expect(ML.displayInfo(nextQuery, nextTaxColumn).breakoutPosition).toBe(0);

      const roundtripQuery = createQuery({
        query: ML.toLegacyQuery(nextQuery),
      });
      const roundtripQueryColumns = ML.breakoutableColumns(roundtripQuery);
      const roundtripTaxColumn = columnFinder(
        roundtripQuery,
        roundtripQueryColumns,
      )("ORDERS", "TAX");

      expect(
        ML.displayInfo(roundtripQuery, roundtripTaxColumn).breakoutPosition,
      ).toBe(0);
    });
  });

  describe("replace breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      ML.breakoutableColumns(query),
    );

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");
      const productCategory = findBreakoutableColumn("PRODUCTS", "CATEGORY");

      const breakoutQuery = ML.breakout(query, productTitle);
      const breakouts = ML.breakouts(breakoutQuery);

      expect(breakouts).toHaveLength(1);
      const nextQuery = ML.replaceClause(
        breakoutQuery,
        breakouts[0],
        productCategory,
      );
      const nextBreakouts = ML.breakouts(nextQuery);
      expect(ML.displayName(nextQuery, nextBreakouts[0])).toBe("Category");
      expect(breakouts[0]).not.toEqual(nextBreakouts[0]);
    });
  });

  describe("remove breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      ML.breakoutableColumns(query),
    );

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");

      const breakoutQuery = ML.breakout(query, productTitle);
      const breakouts = ML.breakouts(breakoutQuery);
      expect(breakouts).toHaveLength(1);

      const nextQuery = ML.removeClause(breakoutQuery, breakouts[0]);
      expect(ML.breakouts(nextQuery)).toHaveLength(0);
    });
  });
});
