import {
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_database_fixture";

const ORDERS_PRODUCT_ID_FIELD_REF = ["field", ORDERS.ID.id, null];
const PRODUCT_ID_FIELD_REF = [
  "field",
  PRODUCTS.ID.id,
  { "join-alias": "Products" },
];

function getJoin({
  sourceTable = PRODUCTS.id,
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
      const q = ORDERS.query();
      expect(q.clean() === q).toBe(true);
    });

    describe("joins", () => {
      it("should not remove join referencing valid field ID", () => {
        const q = ORDERS.query().join(getJoin());
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
        const q = ORDERS.query().join(join);

        expect(q.clean().query()).toEqual({
          "source-table": ORDERS.id,
          joins: [{ ...join, condition: VALID_CONDITION }],
        });
      });

      it("should remove join without any condition", () => {
        const q = ORDERS.query().join(getJoin({ condition: null }));
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      it("should remove join referencing invalid source field", () => {
        const q = ORDERS.query().join(
          getJoin({ condition: ["=", null, PRODUCT_ID_FIELD_REF] }),
        );
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      it("should remove join referencing invalid join field", () => {
        const q = ORDERS.query().join(
          getJoin({ condition: ["=", ORDERS_PRODUCT_ID_FIELD_REF, null] }),
        );
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });
    });

    describe("filters", () => {
      it("should not remove filter referencing valid field ID", () => {
        const q = ORDERS.query().filter([
          "=",
          ["field", ORDERS.TOTAL.id, null],
          42,
        ]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should remove filters referencing invalid field ID", () => {
        const q = ORDERS.query().filter(["=", ["field", 12345, null], 42]);
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });
    });

    describe("aggregations", () => {
      describe("standard aggregations", () => {
        it("should not remove count", () => {
          const q = ORDERS.query().aggregate(["count"]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should not remove aggregation referencing valid field ID", () => {
          const q = ORDERS.query().aggregate([
            "avg",
            ["field", ORDERS.TOTAL.id, null],
          ]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should remove aggregations referencing invalid field ID", () => {
          const q = ORDERS.query().aggregate(["avg", ["field", 12345, null]]);
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS.id,
          });
        });
      });

      describe("named aggregations", () => {
        it("should not remove valid named aggregations", () => {
          const q = ORDERS.query().aggregate([
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
          const q = ORDERS.query().aggregate(["metric", 1]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should remove invalid metrics", () => {
          const q = ORDERS.query().aggregate(["metric", 1234]);
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS.id,
          });
        });
      });

      describe("custom aggregations", () => {
        it("should not remove count + 1", () => {
          const q = ORDERS.query().aggregate(["+", ["count"], 1]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });

        it("should not remove custom aggregation referencing valid field ID", () => {
          const q = ORDERS.query().aggregate([
            "+",
            ["avg", ["field", ORDERS.TOTAL.id, null]],
            1,
          ]);
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
      });
    });

    describe("breakouts", () => {
      it("should not remove breakout referencing valid field ID", () => {
        const q = ORDERS.query().breakout(["field", ORDERS.TOTAL.id, null]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid expressions", () => {
        const q = ORDERS.query()
          .addExpression("foo", ["field", ORDERS.TOTAL.id, null])
          .breakout(["expression", "foo"]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid fk", () => {
        const q = ORDERS.query().breakout([
          "field",
          PRODUCTS.TITLE.id,
          { "source-field": ORDERS.PRODUCT_ID.id },
        ]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should not remove breakout referencing valid joined fields", () => {
        const q = ORDERS.query()
          .join(getJoin())
          .breakout(["field", PRODUCTS.TITLE.id, { "join-alias": "Products" }]);
        expect(q.clean().query()).toEqual(q.query());
      });
      it("should remove breakout referencing invalid field ID", () => {
        const q = ORDERS.query().breakout(["field", 12345, null]);
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });
    });

    describe("nested", () => {
      it("shouldn't modify valid nested queries", () => {
        const q = ORDERS.query()
          .aggregate(["count"])
          .breakout(["field", ORDERS.PRODUCT_ID.id, null])
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
        const q = ORDERS.query().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      it("should remove unnecessary layers of nesting via question()", () => {
        const q = ORDERS.query().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      it("should remove clauses dependent on removed clauses in the parent", () => {
        const q = ORDERS.query()
          .breakout(["field", ORDERS.PRODUCT_ID.id, null])
          .nest()
          .filter([
            "=",
            ["field", "count", { "base-type": "type/Integer" }],
            42,
          ]);
        expect(q.clean().query()).toEqual({
          breakout: [["field", ORDERS.PRODUCT_ID.id, null]],
          "source-table": ORDERS.id,
        });
      });
    });
  });

  describe("cleanNesting", () => {
    it("should not modify empty queries with no source-query", () => {
      expect(
        SAMPLE_DATABASE.question().query().cleanNesting().datasetQuery(),
      ).toEqual({
        type: "query",
        database: SAMPLE_DATABASE.id,
        query: { "source-table": undefined },
      });
    });
    it("should remove outer empty queries", () => {
      expect(
        ORDERS.query()
          .updateLimit(10)
          .nest()
          .nest()
          .nest()
          .cleanNesting()
          .query(),
      ).toEqual({ "source-table": ORDERS.id, limit: 10 });
    });
    it("should remove intermediate empty queries", () => {
      expect(
        ORDERS.query()
          .nest()
          .nest()
          .nest()
          .updateLimit(10)
          .cleanNesting()
          .query(),
      ).toEqual({ "source-query": { "source-table": ORDERS.id }, limit: 10 });
    });
  });
});
