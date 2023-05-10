import { createMetadata } from "__support__/sample_database_fixture";
import { createMockTable } from "metabase-types/api/mocks";
import { createProductsTitleField } from "metabase-types/api/mocks/presets";
import { createQuery, columnFinder } from "./test-helpers";
import * as ML from "./v2";

describe("order by", () => {
  describe("orderableColumns", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(query, ML.orderableColumns(query));

    it("returns metadata for columns in the source table", () => {
      const ordersID = findOrderableColumn("ORDERS", "ID");

      expect(ML.displayInfo(query, ordersID)).toEqual(
        expect.objectContaining({
          name: "ID",
          displayName: "ID",
          effectiveType: "type/BigInteger",
          semanticType: "type/PK",
          isCalculated: false,
          isFromJoin: false,
          isFromPreviousStage: false,
          isImplicitlyJoinable: false,
          table: {
            name: "ORDERS",
            displayName: "Orders",
            isSourceTable: true,
          },
        }),
      );
    });

    it("returns metadata for columns in implicitly joinable tables", () => {
      const productsTitle = findOrderableColumn("PRODUCTS", "TITLE");

      expect(ML.displayInfo(query, productsTitle)).toEqual(
        expect.objectContaining({
          name: "TITLE",
          displayName: "Title",
          effectiveType: "type/Text",
          semanticType: "type/Title",
          isCalculated: false,
          isFromJoin: false,
          isFromPreviousStage: false,
          isImplicitlyJoinable: true,
          table: {
            name: "PRODUCTS",
            displayName: "Products",
            isSourceTable: false,
          },
        }),
      );
    });

    it("returns metadata for columns in source question/model", () => {
      const table_id = "card__1";
      const field = createProductsTitleField({ table_id });
      const table = createMockTable({
        id: table_id,
        name: "Product Model",
        display_name: "Product Model",
        fields: [field],
      });
      const metadata = createMetadata(state =>
        state.assocIn(["entities", "tables", table.id], table),
      );

      const query = createQuery({
        databaseId: table.db_id,
        metadata,
        query: {
          type: "query",
          database: table.db_id,
          query: { "source-table": table_id },
        },
      });

      const columns = ML.orderableColumns(query);

      const productsTitle = columns.find(
        (columnMetadata: ML.ColumnMetadata) => {
          const displayInfo = ML.displayInfo(query, columnMetadata);
          return (
            displayInfo.displayName === "Title" &&
            displayInfo.table?.displayName === "Product Model"
          );
        },
      );

      expect(ML.displayInfo(query, productsTitle as ML.ColumnMetadata)).toEqual(
        expect.objectContaining({
          name: field.name,
          displayName: field.display_name,
          effectiveType: field.base_type,
          table: { name: "Product Model", displayName: "Product Model" },
        }),
      );
    });
  });

  describe("add order by", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(query, ML.orderableColumns(query));

    it("should handle no order by clauses", () => {
      expect(ML.orderBys(query)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");
      const nextQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(nextQuery);

      expect(orderBys).toHaveLength(1);
      expect(ML.displayName(nextQuery, orderBys[0])).toBe("Title ascending");
    });
  });

  describe("replace order by", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(query, ML.orderableColumns(query));

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");
      const productCategory = findOrderableColumn("PRODUCTS", "CATEGORY");

      const orderedQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(orderedQuery);

      expect(orderBys).toHaveLength(1);
      const nextQuery = ML.replaceClause(
        orderedQuery,
        orderBys[0],
        ML.orderByClause(orderedQuery, -1, productCategory, "desc"),
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
    const findOrderableColumn = columnFinder(query, ML.orderableColumns(query));

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");

      const orderedQuery = ML.orderBy(query, productTitle);
      const orderBys = ML.orderBys(orderedQuery);
      expect(orderBys).toHaveLength(1);

      const nextQuery = ML.removeClause(orderedQuery, orderBys[0]);
      expect(ML.orderBys(nextQuery)).toHaveLength(0);
    });
  });
});
