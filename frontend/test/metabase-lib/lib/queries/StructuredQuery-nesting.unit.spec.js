import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const productsTable = metadata.table(PRODUCTS_ID);
const peopleTable = metadata.table(PEOPLE_ID);

describe("StructuredQuery nesting", () => {
  describe("nest", () => {
    it("should nest correctly", () => {
      const q = ordersTable.query();
      expect(q.query()).toEqual({ "source-table": ORDERS_ID });
      expect(q.nest().query()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });

    it("should be able to modify the outer question", () => {
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
      const q = ordersTable.query();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
      });
    });
    it("should return the query if it's not summarized", () => {
      const q = ordersTable.query().aggregate(["count"]);
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
    it("should return last stage if none are summarized", () => {
      const q = ordersTable.query().nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-query": { "source-table": ORDERS_ID },
      });
    });
    it("should return last summarized stage if any is summarized", () => {
      const q = ordersTable.query().aggregate(["count"]).nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      });
    });
  });

  describe("topLevelDimension", () => {
    it("should return same dimension if not nested", () => {
      const q = ordersTable.query();
      const d = q.topLevelDimension(
        q.parseFieldReference(["field", ORDERS.TOTAL, null]),
      );
      expect(d.mbql()).toEqual(["field", ORDERS.TOTAL, null]);
    });
    it("should return underlying dimension for a nested query", () => {
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
    let dataset;
    let virtualCardTable;
    beforeEach(() => {
      const question = ordersTable.question();
      dataset = question.setId(123).setDataset(true);

      // create a virtual table for the card
      // that contains fields from both Orders and Products tables
      // to imitate an explicit join of Products to Orders
      virtualCardTable = ordersTable.clone();
      virtualCardTable.id = `card__123`;
      virtualCardTable.fields = virtualCardTable.fields
        .map(f =>
          f.clone({
            table_id: `card__123`,
            uniqueId: `card__123:${f.id}`,
          }),
        )
        .concat(
          productsTable.fields.map(f => {
            const field = f.clone({
              table_id: `card__123`,
              uniqueId: `card__123:${f.id}`,
            });

            return field;
          }),
        );

      // add instances to the `metadata` instance
      metadata.questions[dataset.id()] = dataset;
      metadata.tables[virtualCardTable.id] = virtualCardTable;
      virtualCardTable.fields.forEach(f => {
        metadata.fields[f.uniqueId] = f;
      });
    });

    it("should not include implicit join dimensions when the underyling question has an explicit join", () => {
      const nestedDatasetQuery = dataset.composeDataset().query();
      expect(
        // get a list of all dimension options for the nested query
        nestedDatasetQuery
          .dimensionOptions()
          .all()
          .map(d => d.field().getPlainObject()),
      ).toEqual([
        // Order fields
        ...ordersTable.fields.map(f =>
          f
            .clone({
              table_id: `card__123`,
              uniqueId: `card__123:${f.id}`,
            })
            .getPlainObject(),
        ),
        // Product fields from the explicit join
        ...productsTable.fields.map(f =>
          f
            .clone({
              table_id: `card__123`,
              uniqueId: `card__123:${f.id}`,
            })
            .getPlainObject(),
        ),
        // People fields from the implicit join
        ...peopleTable.fields.map(f => f.getPlainObject()),
      ]);
    });
  });
});
