import { createMetadata } from "__support__/sample_database_fixture";
import type { Field } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { createProductsTitleField } from "metabase-types/api/mocks/presets";
import { createQuery, SAMPLE_DATABASE } from "./test-helpers";
import * as ML from "./v2";

describe("order by", () => {
  describe("orderableColumns", () => {
    it("returns metadata for columns in the source table", () => {
      const query = createQuery();
      const columns = ML.orderableColumns(query);

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
      const query = createQuery();
      const columns = ML.orderableColumns(query);

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

    it("returns metadata for columns in source question/model", () => {
      const table_id = "card__1";
      const field = createProductsTitleField({ table_id });
      const table = createMockTable({
        id: table_id,
        name: "Product Model",
        fields: [field],
      });
      const metadata = createMetadata(state =>
        state.assocIn(["entities", "tables", table.id], table),
      );
      const columns = ML.orderableColumns(
        createQuery({
          databaseId: table.db_id,
          metadata,
          query: {
            type: "query",
            database: table.db_id,
            query: { "source-table": table_id },
          },
        }),
      );

      const productsTitle = columns.find(
        ({ id }) => id === field.id && field.table_id === table_id,
      );

      expect(productsTitle).toEqual(
        expect.objectContaining({
          id: field.id,
          table_id,
          name: field.name,
          display_name: field.display_name,
          base_type: field.base_type,
        }),
      );
    });
  });

  describe("add order by", () => {
    it("should handle no order by clauses", () => {
      const query = createQuery();
      expect(ML.orderBys(query)).toHaveLength(0);
    });

    it("should update the query", () => {
      const query = createQuery();
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
        ML.orderByClause(orderedQuery, -1, productCategory as Field, "desc"),
      );
      const nextOrderBys = ML.orderBys(nextQuery);
      expect(ML.displayName(nextQuery, nextOrderBys[0])).toBe(
        "Category descending",
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
