import { createQuery } from "./test-helpers";
import * as ML from "./v2";

// This is a convenience for finding an breakout column (as an opaque object) by name
// TODO change to breakoutableColumn
const findBreakoutableColumn = (
  query: ML.Query,
  tableName: string,
  fieldName: string,
): ML.ColumnMetadata => {
  const column = ML.orderableColumns(query).find(
    (column: ML.ColumnMetadata) => {
      const displayInfo = ML.displayInfo(query, column);
      return (
        displayInfo?.table?.name === tableName &&
        displayInfo?.name === fieldName
      );
    },
  );

  if (!column) {
    throw new Error(`Could not find ${tableName}.${fieldName}`);
  }

  return column;
};

describe("breakout", () => {
  describe("add breakout", () => {
    const query = createQuery();

    it("should handle no breakout clauses", () => {
      expect(ML.breakouts(query)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn(query, "PRODUCTS", "TITLE");
      const nextQuery = ML.breakout(query, productTitle);
      const breakouts = ML.breakouts(nextQuery);

      expect(breakouts).toHaveLength(1);
      expect(ML.displayName(nextQuery, breakouts[0])).toBe("Title");
    });
  });

  describe("replace breakout", () => {
    const query = createQuery();

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn(query, "PRODUCTS", "TITLE");
      const productCategory = findBreakoutableColumn(
        query,
        "PRODUCTS",
        "CATEGORY",
      );

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

    it("should update the query", () => {
      const productTitle = findBreakoutableColumn(query, "PRODUCTS", "TITLE");

      const breakoutQuery = ML.breakout(query, productTitle);
      const breakouts = ML.breakouts(breakoutQuery);
      expect(breakouts).toHaveLength(1);

      const nextQuery = ML.removeClause(breakoutQuery, breakouts[0]);
      expect(ML.breakouts(nextQuery)).toHaveLength(0);
    });
  });
});
