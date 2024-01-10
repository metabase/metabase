import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "./test-helpers";

describe("breakout", () => {
  describe("add breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      Lib.breakoutableColumns(query, 0),
    );

    it("should handle no breakout clauses", () => {
      expect(Lib.breakouts(query, 0)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");
      const nextQuery = Lib.breakout(query, 0, productTitle);
      const breakouts = Lib.breakouts(nextQuery, 0);

      expect(breakouts).toHaveLength(1);
      expect(Lib.displayName(nextQuery, breakouts[0])).toBe("Title");
    });

    it("should preserve breakout positions between v1-v2 roundtrip", () => {
      const query = createQuery();
      const taxColumn = findBreakoutableColumn("ORDERS", "TAX");
      const nextQuery = Lib.breakout(query, 0, taxColumn);
      const nextQueryColumns = Lib.breakoutableColumns(nextQuery, 0);
      const nextTaxColumn = columnFinder(nextQuery, nextQueryColumns)(
        "ORDERS",
        "TAX",
      );

      expect(
        Lib.displayInfo(nextQuery, 0, nextTaxColumn).breakoutPosition,
      ).toBe(0);

      const roundtripQuery = createQuery({
        query: Lib.toLegacyQuery(nextQuery),
      });
      const roundtripQueryColumns = Lib.breakoutableColumns(roundtripQuery, 0);
      const roundtripTaxColumn = columnFinder(
        roundtripQuery,
        roundtripQueryColumns,
      )("ORDERS", "TAX");

      expect(
        Lib.displayInfo(roundtripQuery, 0, roundtripTaxColumn).breakoutPosition,
      ).toBe(0);
    });
  });

  describe("replace breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      Lib.breakoutableColumns(query, 0),
    );

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");
      const productCategory = findBreakoutableColumn("PRODUCTS", "CATEGORY");

      const breakoutQuery = Lib.breakout(query, 0, productTitle);
      const breakouts = Lib.breakouts(breakoutQuery, 0);

      expect(breakouts).toHaveLength(1);
      const nextQuery = Lib.replaceClause(
        breakoutQuery,
        0,
        breakouts[0],
        productCategory,
      );
      const nextBreakouts = Lib.breakouts(nextQuery, 0);
      expect(Lib.displayName(nextQuery, nextBreakouts[0])).toBe("Category");
      expect(breakouts[0]).not.toEqual(nextBreakouts[0]);
    });
  });

  describe("remove breakout", () => {
    const query = createQuery();
    const findBreakoutableColumn = columnFinder(
      query,
      Lib.breakoutableColumns(query, 0),
    );

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn("PRODUCTS", "TITLE");

      const breakoutQuery = Lib.breakout(query, 0, productTitle);
      const breakouts = Lib.breakouts(breakoutQuery, 0);
      expect(breakouts).toHaveLength(1);

      const nextQuery = Lib.removeClause(breakoutQuery, 0, breakouts[0]);
      expect(Lib.breakouts(nextQuery, 0)).toHaveLength(0);
    });
  });
});
