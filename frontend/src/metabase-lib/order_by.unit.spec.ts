import type { Field } from "metabase-types/api";
import { createQuery, SAMPLE_DATABASE } from "./test-helpers";
import * as ML from "./v2";

describe("order by", () => {
  describe("orderableColumns", () => {
    const query = createQuery();
    const columns = ML.orderableColumns(query);

    it("returns metadata for columns in the source table", () => {
      const ordersID = columns.find(
        ({ id }) => id === SAMPLE_DATABASE.ORDERS.ID.id,
      );

      expect(ordersID).toEqual(
        expect.objectContaining({
          table_id: SAMPLE_DATABASE.ORDERS.id,
          name: "ID",
          id: SAMPLE_DATABASE.ORDERS.ID.id,
          display_name: "ID",
          base_type: "type/BigInteger",
        }),
      );
    });

    it("returns metadata for columns in implicitly joinable tables", () => {
      const productsTitle = columns.find(
        ({ id }) => id === SAMPLE_DATABASE.PRODUCTS.TITLE.id,
      );

      expect(productsTitle).toEqual(
        expect.objectContaining({
          table_id: SAMPLE_DATABASE.PRODUCTS.id,
          name: "TITLE",
          id: SAMPLE_DATABASE.PRODUCTS.TITLE.id,
          display_name: "Title",
          base_type: "type/Text",
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
      const columns = ML.orderableColumns(query);
      const productTitle = columns.find(
        column => column.id === SAMPLE_DATABASE.PRODUCTS.TITLE.id,
      );
      const nextQuery = ML.orderBy(query, productTitle as Field);
      const orderBys = ML.orderBys(nextQuery);

      expect(orderBys).toHaveLength(1);
      expect(ML.displayName(nextQuery, orderBys[0])).toBe("Title ascending");
    });
  });

  describe("replace order by", () => {
    const query = createQuery();

    it("should update the query", () => {
      const columns = ML.orderableColumns(query);
      const productTitle = columns.find(
        column => column.id === SAMPLE_DATABASE.PRODUCTS.TITLE.id,
      );

      const productCategory = columns.find(
        column => column.id === SAMPLE_DATABASE.PRODUCTS.CATEGORY.id,
      );
      const orderedQuery = ML.orderBy(query, productTitle as Field);
      const orderBys = ML.orderBys(orderedQuery);

      expect(orderBys).toHaveLength(1);
      const nextQuery = ML.replaceClause(
        orderedQuery,
        orderBys[0],
        ML.orderByClause(orderedQuery, -1, productCategory as Field) as Field,
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
      const columns = ML.orderableColumns(query);
      const productTitle = columns.find(
        column => column.id === SAMPLE_DATABASE.PRODUCTS.TITLE.id,
      );

      const orderedQuery = ML.orderBy(query, productTitle as Field);
      const orderBys = ML.orderBys(orderedQuery);
      expect(orderBys).toHaveLength(1);

      const nextQuery = ML.removeClause(orderedQuery, orderBys[0]);
      expect(ML.orderBys(nextQuery)).toHaveLength(0);
    });
  });
});
