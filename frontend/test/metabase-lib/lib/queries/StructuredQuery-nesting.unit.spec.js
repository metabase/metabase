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
import { createMockMetadata } from "__support__/metadata";

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
      const q = ordersTable.query();
      expect(q.query()).toEqual({ "source-table": ORDERS_ID });
      expect(q.nest().query()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });

    it("should be able to modify the outer question", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query();
      expect(
        q
          .nest()
          .filter(["=", ["field", ORDERS.TOTAL, null], 42])
          .query(),
      ).toEqual({
        "source-query": { "source-table": ORDERS_ID },
        filter: ["=", ["field", ORDERS.TOTAL, null], 42],
      });
    });

    it("should be able to modify the source question", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query();
      expect(
        q
          .nest()
          .sourceQuery()
          .filter(["=", ["field", ORDERS.TOTAL, null], 42])
          .parentQuery()
          .query(),
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
        .query()
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

  describe("topLevelFilters", () => {
    it("should return filters for the last two stages", () => {
      const { ordersTable } = setup();
      const q = ordersTable
        .query()
        .aggregate(["count"])
        .filter(["=", ["field", ORDERS.PRODUCT_ID, null], 1])
        .nest()
        .filter(["=", ["field", "count", { "base-type": "type/Integer" }], 2]);
      const filters = q.topLevelFilters();
      expect(filters).toHaveLength(2);
      expect(filters[0]).toEqual(["=", ["field", ORDERS.PRODUCT_ID, null], 1]);
      expect(filters[1]).toEqual([
        "=",
        ["field", "count", { "base-type": "type/Integer" }],
        2,
      ]);
    });
  });

  describe("topLevelQuery", () => {
    it("should return the query if it's summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
      });
    });
    it("should return the query if it's not summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query().aggregate(["count"]);
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
    it("should return last stage if none are summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query().nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });
    it("should return last summarized stage if any is summarized", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query().aggregate(["count"]).nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
  });

  describe("topLevelDimension", () => {
    it("should return same dimension if not nested", () => {
      const { ordersTable } = setup();
      const q = ordersTable.query();
      const d = q.topLevelDimension(
        q.parseFieldReference(["field", ORDERS.TOTAL, null]),
      );
      expect(d.mbql()).toEqual(["field", ORDERS.TOTAL, null]);
    });
    it("should return underlying dimension for a nested query", () => {
      const { ordersTable } = setup();
      const q = ordersTable
        .query()
        .aggregate(["count"])
        .breakout(["field", ORDERS.TOTAL, null])
        .nest();
      const d = q.topLevelDimension(
        q.parseFieldReference([
          "field",
          "TOTAL",
          { "base-type": "type/Float" },
        ]),
      );
      expect(d.mbql()).toEqual(["field", ORDERS.TOTAL, null]);
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
      const dataset = question.setId(1).setDataset(true);
      const nestedDatasetQuery = dataset.composeDataset().query();
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
