import { createMockMetadata } from "__support__/metadata";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createProductsTable,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

const setup = ({ tables = [] } = {}) => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    tables,
  });

  return {
    ordersTable: metadata.table(ORDERS_ID),
    productsTable: metadata.table(PRODUCTS_ID),
    peopleTable: metadata.table(PEOPLE_ID),
  };
};

describe("StructuredQuery nesting", () => {
  describe("nest", () => {
    it("should nest correctly", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery();
      expect(q.legacyQuery()).toEqual({
        "source-table": ORDERS_ID,
      });
      expect(q.nest().legacyQuery()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });

    it("should be able to modify the outer question", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery();
      expect(
        q
          .nest()
          .filter(["=", ["field", ORDERS.TOTAL, null], 42])
          .legacyQuery(),
      ).toEqual({
        "source-query": { "source-table": ORDERS_ID },
        filter: ["=", ["field", ORDERS.TOTAL, null], 42],
      });
    });

    it("should be able to modify the source question", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery();
      expect(
        q
          .nest()
          .sourceQuery()
          .filter(["=", ["field", ORDERS.TOTAL, null], 42])
          .parentQuery()
          .legacyQuery(),
      ).toEqual({
        "source-query": {
          "source-table": ORDERS_ID,
          filter: ["=", ["field", ORDERS.TOTAL, null], 42],
        },
      });
    });

    it("should return a table with correct dimensions", () => {
      const { ordersTable } = setup();
      const q = ordersTable
        .legacyQuery()
        .aggregate(["count"])
        .breakout(["field", ORDERS.PRODUCT_ID, null]);
      expect(
        q
          .nest()
          .filterDimensionOptions()
          .dimensions.map(d => d.mbql()),
      ).toEqual([
        ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
        ["field", "count", { "base-type": "type/Integer" }],
      ]);
    });
  });

  describe("topLevelQuery", () => {
    it("should return the query if it's summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery();
      expect(q.topLevelQuery().legacyQuery()).toEqual({
        "source-table": ORDERS_ID,
      });
    });
    it("should return the query if it's not summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery().aggregate(["count"]);
      expect(q.topLevelQuery().legacyQuery()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
    it("should return last stage if none are summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery().nest();
      expect(q.topLevelQuery().legacyQuery()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });
    it("should return last summarized stage if any is summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.legacyQuery().aggregate(["count"]).nest();
      expect(q.topLevelQuery().legacyQuery()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
  });

  describe("model question", () => {
    it("should not include implicit join dimensions when the underyling question has an explicit join", () => {
      const fields = [
        ...createOrdersTable().fields,
        ...createProductsTable().fields,
      ];

      const { ordersTable, productsTable, peopleTable } = setup({
        tables: [
          createMockTable({
            id: "card__1",
            fields: fields.map(field =>
              createMockField({ ...field, table_id: "card__1" }),
            ),
          }),
        ],
      });

      const metadata = ordersTable.metadata;
      const question = ordersTable.question();
      const dataset = question.setId(1).setType("model");
      const nestedDatasetQuery = dataset
        .composeDataset()
        .legacyQuery({ useStructuredQuery: true });
      expect(
        // get a list of all dimension options for the nested query
        nestedDatasetQuery
          .dimensionOptions()
          .all()
          .map(d => d.field()),
      ).toEqual([
        // Order fields
        ...ordersTable.fields.map(({ id }) => metadata.field(id, "card__1")),
        // Product fields from the explicit join
        ...productsTable.fields.map(({ id }) => metadata.field(id, "card__1")),
        // People fields from the implicit join
        ...peopleTable.fields,
      ]);
    });
  });
});
