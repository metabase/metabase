import {
  SAMPLE_DATASET,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_dataset_fixture";

const JOIN = {
  "source-table": PRODUCTS.id,
  alias: "join1234",
  condition: [
    "=",
    ["field", ORDERS.ID.id, null],
    ["field", PRODUCTS.ID.id, { "join-alias": "join1234" }],
  ],
  fields: "all",
};

describe("StructuredQuery", () => {
  describe("clean", () => {
    it("should not return a new instance of the same query", () => {
      const q = ORDERS.query();
      expect(q.clean() === q).toBe(true);
    });

    describe("joins", () => {
      it("should not remove join referencing valid field ID", () => {
        const q = ORDERS.query().join(JOIN);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      xit("should remove join referencing invalid source-table", () => {
        const q = ORDERS.query()
          .setTableId(12345)
          .join([JOIN]);
        expect(q.query()).toEqual({ "source-table": 12345, join: [JOIN] });
        expect(q.clean().query()).toEqual({ "source-table": 12345 });
      });

      xit("should remove join referencing invalid source field", () => {
        const q = ORDERS.query().join(JOIN);
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      xit("should remove join referencing invalid join field", () => {
        const q = ORDERS.query().join(JOIN);
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
        xit("should remove invalid named aggregations", () => {
          const q = ORDERS.query().aggregate([
            "aggregation-option",
            ["invalid"],
            { "display-name": "foo" },
          ]);
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS.id,
          });
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
        xit("should remove aggregations referencing invalid field ID", () => {
          const q = ORDERS.query().aggregate([
            ["+", ["avg", ["field", 12345, null]], 1],
          ]);
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS.id,
          });
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
          .join(JOIN)
          .breakout(["field", PRODUCTS.TITLE.id, { "join-alias": "join1234" }]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should remove breakout referencing invalid field ID", () => {
        const q = ORDERS.query().breakout(["field", 12345, null]);
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });
    });

    describe("sorts", () => {
      it("should not remove sort referencing valid field ID", () => {
        const q = ORDERS.query().sort([
          "asc",
          ["field", ORDERS.TOTAL.id, null],
        ]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      xit("should remove sort referencing invalid field ID", () => {
        const q = ORDERS.query().sort(["asc", ["field", 12345, null]]);
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

      it("should remove unecessary layers of nesting via query()", () => {
        const q = ORDERS.query().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS.id });
      });

      it("should remove unecessary layers of nesting via question()", () => {
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
        SAMPLE_DATASET.question()
          .query()
          .cleanNesting()
          .datasetQuery(),
      ).toEqual({
        type: "query",
        database: SAMPLE_DATASET.id,
        query: { "source-table": null },
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
