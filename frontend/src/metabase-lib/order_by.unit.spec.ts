import { createMockMetadata } from "__support__/metadata";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createProductsTitleField,
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { columnFinder, createQuery } from "./test-helpers";
import * as ML from "./v2";

describe("order by", () => {
  describe("orderableColumns", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(
      query,
      ML.orderableColumns(query, 0),
    );

    it("returns metadata for columns in the source table", () => {
      const ordersID = findOrderableColumn("ORDERS", "ID");

      expect(ML.displayInfo(query, 0, ordersID)).toEqual(
        expect.objectContaining({
          name: "ID",
          displayName: "ID",
          longDisplayName: "ID",
          effectiveType: "type/BigInteger",
          semanticType: "type/PK",
          isCalculated: false,
          isFromJoin: false,
          isFromPreviousStage: false,
          isImplicitlyJoinable: false,
          table: {
            name: "ORDERS",
            displayName: "Orders",
            longDisplayName: "Orders",
            isSourceTable: true,
          },
        }),
      );
    });

    it("returns metadata for columns in implicitly joinable tables", () => {
      const productsTitle = findOrderableColumn("PRODUCTS", "TITLE");

      expect(ML.displayInfo(query, 0, productsTitle)).toEqual(
        expect.objectContaining({
          name: "TITLE",
          displayName: "Title",
          longDisplayName: "Product → Title",
          effectiveType: "type/Text",
          semanticType: "type/Title",
          isCalculated: false,
          isFromJoin: false,
          isFromPreviousStage: false,
          isImplicitlyJoinable: true,
          table: {
            name: "PRODUCTS",
            displayName: "Products",
            longDisplayName: "Products",
            isSourceTable: false,
          },
        }),
      );
    });

    it("returns metadata for columns in source question/model", () => {
      const field = createProductsTitleField();
      const card = createMockCard({
        name: "Product Model",
        result_metadata: [field],
      });
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [card],
      });

      const query = createQuery({
        databaseId: SAMPLE_DB_ID,
        metadata,
        query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${card.id}` },
        },
      });

      const columns = ML.orderableColumns(query, 0);

      const productsTitle = columns.find(
        (columnMetadata: ML.ColumnMetadata) => {
          const displayInfo = ML.displayInfo(query, 0, columnMetadata);
          return (
            displayInfo.displayName === "Title" &&
            displayInfo.table?.displayName === "Product Model"
          );
        },
      );

      expect(
        ML.displayInfo(query, 0, productsTitle as ML.ColumnMetadata),
      ).toEqual(
        expect.objectContaining({
          name: field.name,
          displayName: field.display_name,
          effectiveType: field.base_type,
          table: { name: "Product Model", displayName: "Product Model" },
        }),
      );
    });

    it("should preserve order-by positions between v1-v2 roundtrip", () => {
      const query = createQuery();
      const taxColumn = findOrderableColumn("ORDERS", "TAX");
      const nextQuery = ML.orderBy(query, 0, taxColumn);
      const nextQueryColumns = ML.orderableColumns(nextQuery, 0);
      const nextTaxColumn = columnFinder(nextQuery, nextQueryColumns)(
        "ORDERS",
        "TAX",
      );

      expect(ML.displayInfo(nextQuery, 0, nextTaxColumn).orderByPosition).toBe(
        0,
      );

      const roundtripQuery = createQuery({
        query: ML.toLegacyQuery(nextQuery),
      });
      const roundtripQueryColumns = ML.orderableColumns(roundtripQuery, 0);
      const roundtripTaxColumn = columnFinder(
        roundtripQuery,
        roundtripQueryColumns,
      )("ORDERS", "TAX");

      expect(
        ML.displayInfo(roundtripQuery, 0, roundtripTaxColumn).orderByPosition,
      ).toBe(0);
    });
  });

  describe("add order by", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(
      query,
      ML.orderableColumns(query, 0),
    );

    it("should handle no order by clauses", () => {
      expect(ML.orderBys(query, 0)).toHaveLength(0);
    });

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");
      const nextQuery = ML.orderBy(query, 0, productTitle);
      const orderBys = ML.orderBys(nextQuery, 0);

      expect(orderBys).toHaveLength(1);
      expect(ML.displayName(nextQuery, orderBys[0])).toBe("Title ascending");
    });
  });

  describe("replace order by", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(
      query,
      ML.orderableColumns(query, 0),
    );

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");
      const productCategory = findOrderableColumn("PRODUCTS", "CATEGORY");

      const orderedQuery = ML.orderBy(query, 0, productTitle);
      const orderBys = ML.orderBys(orderedQuery, 0);

      expect(orderBys).toHaveLength(1);
      const nextQuery = ML.replaceClause(
        orderedQuery,
        0,
        orderBys[0],
        ML.orderByClause(productCategory, "desc"),
      );
      const nextOrderBys = ML.orderBys(nextQuery, 0);
      expect(ML.displayName(nextQuery, nextOrderBys[0])).toBe(
        "Category descending",
      );
      expect(orderBys[0]).not.toEqual(nextOrderBys[0]);
    });
  });

  describe("remove order by", () => {
    const query = createQuery();
    const findOrderableColumn = columnFinder(
      query,
      ML.orderableColumns(query, 0),
    );

    it("should update the query", () => {
      const productTitle = findOrderableColumn("PRODUCTS", "TITLE");

      const orderedQuery = ML.orderBy(query, 0, productTitle);
      const orderBys = ML.orderBys(orderedQuery, 0);
      expect(orderBys).toHaveLength(1);

      const nextQuery = ML.removeClause(orderedQuery, 0, orderBys[0]);
      expect(ML.orderBys(nextQuery, 0)).toHaveLength(0);
    });
  });
});
