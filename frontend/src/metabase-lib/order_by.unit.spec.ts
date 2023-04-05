import { createQuery } from "./test-helpers";
import * as ML from "./v2";

// This is a convenience for finding an orderable column (as an opaque object) by name
const findOrderableColumn = (
  query: ML.Query,
  tableName: string,
  fieldName: string,
): ML.ColumnMetadata => {
  const columns = ML.orderableColumns(query);
  const column = columns?.find((column: ML.ColumnMetadata) => {
    const displayInfo = ML.displayInfo(query, column);
    return (
      displayInfo?.table?.name === tableName && displayInfo?.name === fieldName
    );
  });

  if (!column) {
    throw new Error("Could not find " + tableName + "." + fieldName);
  }

  return column;
};

describe("order by", () => {
  describe("orderableColumns", () => {
    const query = createQuery();

    it("returns metadata for columns in the source table", () => {
      const ordersID = findOrderableColumn(query, "ORDERS", "ID");

      expect(ML.displayInfo(query, ordersID)).toEqual(
        expect.objectContaining({
          name: "ID",
          display_name: "ID",
          effective_type: "type/BigInteger",
          table: {
            name: "ORDERS",
            display_name: "Orders",
          },
        }),
      );
    });

    it("returns metadata for columns in implicitly joinable tables", () => {
      const productsTitle = findOrderableColumn(query, "PRODUCTS", "TITLE");

      expect(ML.displayInfo(query, productsTitle)).toEqual(
        expect.objectContaining({
          name: "TITLE",
          display_name: "Title",
          effective_type: "type/Text",
          table: {
            name: "PRODUCTS",
            display_name: "Products",
          },
        }),
      );
    });
  });

  describe("add order by", () => {
    const query = createQuery();

    it("should handle no order by clauses", () => {
      expect(ML.orderBys(query)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findOrderableColumn(query, "PRODUCTS", "TITLE");
      const nextQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(nextQuery);

      expect(orderBys).toHaveLength(1);
      expect(ML.displayName(nextQuery, orderBys[0])).toBe("Title ascending");
    });
  });

  describe("replace order by", () => {
    const query = createQuery();

    it("should update the query", () => {
      const productTitle = findOrderableColumn(query, "PRODUCTS", "TITLE");
      const productCategory = findOrderableColumn(
        query,
        "PRODUCTS",
        "CATEGORY",
      );

      const orderedQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(orderedQuery);

      expect(orderBys).toHaveLength(1);
      const nextQuery = ML.replaceClause(
        orderedQuery,
        orderBys[0],
        ML.orderByClause(orderedQuery, -1, productCategory),
      );
      const nextOrderBys = ML.orderBys(nextQuery);
      expect(ML.displayName(nextQuery, nextOrderBys[0])).toBe(
        "Category ascending",
      );
      expect(orderBys[0]).not.toEqual(nextOrderBys[0]);
    });
  });

  describe("remove order by", () => {
    const query = createQuery();

    it("should update the query", () => {
      const productTitle = findOrderableColumn(query, "PRODUCTS", "TITLE");

      const orderedQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(orderedQuery);
      expect(orderBys).toHaveLength(1);

      const nextQuery = ML.removeClause(orderedQuery, orderBys[0]);
      expect(ML.orderBys(nextQuery)).toHaveLength(0);
    });
  });
});
