import { createMockMetadata } from "__support__/metadata";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [createMockMetric({ id: 1 })],
});

const db = metadata.database(SAMPLE_DB_ID);
const ordersTable = metadata.table(ORDERS_ID);

const ORDERS_PRODUCT_ID_FIELD_REF = ["field", ORDERS.ID, null];
const PRODUCT_ID_FIELD_REF = [
  "field",
  PRODUCTS.ID,
  { "join-alias": "Products" },
];

function getJoin({
  sourceTable = PRODUCTS_ID,
  alias = "Products",
  condition = ["=", ORDERS_PRODUCT_ID_FIELD_REF, PRODUCT_ID_FIELD_REF],
  fields = "all",
} = {}) {
  return {
    "source-table": sourceTable,
    alias,
    condition,
    fields,
  };
}

describe("StructuredQuery", () => {
  describe("clean", () => {
    it("should not return a new instance of the same query", () => {
      const q = ordersTable.query();
      expect(q.clean() === q).toBe(true);
    });

    describe("joins", () => {
      it("should not remove join referencing valid field ID", () => {
        const q = ordersTable.query().join(getJoin());
        expect(q.clean().query()).toEqual(q.query());
      });

      it("should clean invalid parts of multiple field joins and keep the valid ones", () => {
        const VALID_CONDITION = [
          "=",
          ORDERS_PRODUCT_ID_FIELD_REF,
          PRODUCT_ID_FIELD_REF,
        ];
        const join = getJoin({
          condition: [
            "and",
            VALID_CONDITION,
            ["=", ORDERS_PRODUCT_ID_FIELD_REF, null],
            ["=", null, PRODUCT_ID_FIELD_REF],
            ["=", null, null],
          ],
        });
        const q = ordersTable.query().join(join);

        expect(q.clean().query()).toEqual({
          "source-table": ORDERS_ID,
          joins: [{ ...join, condition: VALID_CONDITION }],
        });
      });

      it("should remove join without any condition", () => {
        const q = ordersTable.query().join(getJoin({ condition: null }));
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });

      it("should remove join referencing invalid source field", () => {
        const q = ordersTable
          .query()
          .join(getJoin({ condition: ["=", null, PRODUCT_ID_FIELD_REF] }));
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });

      it("should remove join referencing invalid join field", () => {
        const q = ordersTable
          .query()
          .join(
            getJoin({ condition: ["=", ORDERS_PRODUCT_ID_FIELD_REF, null] }),
          );
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });
    });

    describe("filters", () => {
      it("should not remove filter referencing valid field ID", () => {
        const q = ordersTable
          .query()
          .filter(["=", ["field", ORDERS.TOTAL, null], 42]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should remove filters referencing invalid field ID", () => {
        const q = ordersTable.query().filter(["=", ["field", 12345, null], 42]);
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });
    });

    describe("aggregations", () => {
      describe("standard aggregations", () => {
        it("should not remove count", () => {
          const q = ordersTable.query().aggregate(["count"]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should not remove aggregation referencing valid field ID", () => {
          const q = ordersTable
            .query()
            .aggregate(["avg", ["field", ORDERS.TOTAL, null]]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("named aggregations", () => {
        it("should not remove valid named aggregations", () => {
          const q = ordersTable
            .query()
            .aggregate([
              "aggregation-options",
              ["count"],
              { "display-name": "foo" },
            ]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("metric aggregations", () => {
        it("should not remove valid metrics", () => {
          const q = ordersTable.query().aggregate(["metric", 1]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("custom aggregations", () => {
        it("should not remove count + 1", () => {
          const q = ordersTable.query().aggregate(["+", ["count"], 1]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });

        it("should not remove custom aggregation referencing valid field ID", () => {
          const q = ordersTable
            .query()
            .aggregate(["+", ["avg", ["field", ORDERS.TOTAL, null]], 1]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
      });
    });

    describe("breakouts", () => {
      it("should not remove breakout referencing valid field ID", () => {
        const q = ordersTable.query().breakout(["field", ORDERS.TOTAL, null]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid expressions", () => {
        const q = ordersTable
          .query()
          .addExpression("foo", ["field", ORDERS.TOTAL, null])
          .breakout(["expression", "foo"]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid fk", () => {
        const q = ordersTable
          .query()
          .breakout([
            "field",
            PRODUCTS.TITLE,
            { "source-field": ORDERS.PRODUCT_ID },
          ]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should not remove breakout referencing valid joined fields", () => {
        const q = ordersTable
          .query()
          .join(getJoin())
          .breakout(["field", PRODUCTS.TITLE, { "join-alias": "Products" }]);
        expect(q.clean().query()).toEqual(q.query());
      });
    });

    describe("nested", () => {
      it("shouldn't modify valid nested queries", () => {
        const q = ordersTable
          .query()
          .aggregate(["count"])
          .breakout(["field", ORDERS.PRODUCT_ID, null])
          .nest()
          .filter([
            "=",
            ["field", "count", { "base-type": "type/Integer" }],
            42,
          ]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should remove unnecessary layers of nesting via query()", () => {
        const q = ordersTable.query().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });

      it("should remove unnecessary layers of nesting via question()", () => {
        const q = ordersTable.query().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_ID });
      });

      it("should remove clauses dependent on removed clauses in the parent", () => {
        const q = ordersTable
          .query()
          .breakout(["field", ORDERS.PRODUCT_ID, null])
          .nest()
          .filter([
            "=",
            ["field", "count", { "base-type": "type/Integer" }],
            42,
          ]);
        expect(q.clean().query()).toEqual({
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          "source-table": ORDERS_ID,
        });
      });
    });
  });

  describe("cleanNesting", () => {
    it("should not modify empty queries with no source-query", () => {
      expect(db.question().query().cleanNesting().datasetQuery()).toEqual({
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": undefined },
      });
    });
    it("should remove outer empty queries", () => {
      expect(
        ordersTable
          .query()
          .updateLimit(10)
          .nest()
          .nest()
          .nest()
          .cleanNesting()
          .query(),
      ).toEqual({ "source-table": ORDERS_ID, limit: 10 });
    });
    it("should remove intermediate empty queries", () => {
      expect(
        ordersTable
          .query()
          .nest()
          .nest()
          .nest()
          .updateLimit(10)
          .cleanNesting()
          .query(),
      ).toEqual({ "source-query": { "source-table": ORDERS_ID }, limit: 10 });
    });
  });
});
