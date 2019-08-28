import {
  ORDERS_TABLE_ID,
  ORDERS_PK_FIELD_ID,
  ORDERS_TOTAL_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_TABLE_ID,
  PRODUCT_PK_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

const JOIN = {
  "source-table": PRODUCT_TABLE_ID,
  alias: "join1234",
  condition: [
    "=",
    ["field-id", ORDERS_PK_FIELD_ID],
    ["joined-field", "join1234", ["field-id", PRODUCT_PK_FIELD_ID]],
  ],
  fields: "all",
};

describe("StructuredQuery", () => {
  describe("clean", () => {
    it("should not return a new instance of the same query", () => {
      const q = makeStructuredQuery();
      expect(q.clean() === q).toBe(true);
    });

    describe("joins", () => {
      it("should not remove join referencing valid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          joins: [JOIN],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      xit("should remove join referencing invalid source-table", () => {
        const q = makeStructuredQuery({
          "source-table": 1245,
          joins: [JOIN],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });

      xit("should remove join referencing invalid source field", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          joins: [JOIN],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });

      xit("should remove join referencing invalid join field", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          joins: [JOIN],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });
    });

    describe("filters", () => {
      it("should not remove filter referencing valid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          filter: ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should remove filters referencing invalid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          filter: ["=", ["field-id", 12345], 42],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });
    });

    describe("aggregations", () => {
      describe("standard aggregations", () => {
        it("should not remove count", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["count"]],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should not remove aggregation referencing valid field-id", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["avg", ["field-id", ORDERS_TOTAL_FIELD_ID]]],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should remove aggregations referencing invalid field-id", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["avg", ["field-id", 12345]]],
          });
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS_TABLE_ID,
          });
        });
      });

      describe("named aggregations", () => {
        it("should not remove valid named aggregations", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [
              ["aggregation-options", ["count"], { "display-name": "foo" }],
            ],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should remove invalid named aggregations", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [
              ["aggregation-option", ["invalid"], { "display-name": "foo" }],
            ],
          });
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS_TABLE_ID,
          });
        });
      });

      describe("metric aggregations", () => {
        it("should not remove valid metrics", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["metric", 1]],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should remove invalid metrics", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["metric", 1234]],
          });
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS_TABLE_ID,
          });
        });
      });

      describe("custom aggregations", () => {
        it("should not remove count + 1", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["+", ["count"], 1]],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        it("should not remove custom aggregation referencing valid field-id", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [
              ["+", ["avg", ["field-id", ORDERS_TOTAL_FIELD_ID]], 1],
            ],
          });
          expect(q.clean().query()).toEqual(q.query());
          expect(q.clean() === q).toBe(true);
        });
        xit("should remove aggregations referencing invalid field-id", () => {
          const q = makeStructuredQuery({
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["+", ["avg", ["field-id", 12345]], 1]],
          });
          expect(q.clean().query()).toEqual({
            "source-table": ORDERS_TABLE_ID,
          });
        });
      });
    });

    describe("breakouts", () => {
      it("should not remove breakout referencing valid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          breakout: [["field-id", ORDERS_TOTAL_FIELD_ID]],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid expressions", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          expressions: {
            foo: ["field-id", ORDERS_TOTAL_FIELD_ID],
          },
          breakout: [["expression", "foo"]],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid fk->", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          breakout: [
            [
              "fk->",
              ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
              ["field-id", PRODUCT_TILE_FIELD_ID],
            ],
          ],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should not remove breakout referencing valid joined-fields", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          joins: [JOIN],
          breakout: [
            ["joined-field", "join1234", ["field-id", PRODUCT_TILE_FIELD_ID]],
          ],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });
      it("should remove breakout referencing invalid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          breakout: [["field-id", 12345]],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });
    });

    describe("sorts", () => {
      it("should not remove sort referencing valid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          "order-by": [["asc", ["field-id", ORDERS_TOTAL_FIELD_ID]]],
        });
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      xit("should remove sort referencing invalid field-id", () => {
        const q = makeStructuredQuery({
          "source-table": ORDERS_TABLE_ID,
          "order-by": [["asc", ["field-id", 12345]]],
        });
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });
    });

    describe("nested", () => {
      it("shouldn't modify valid nested queries", () => {
        const q = makeStructuredQuery()
          .addAggregation(["count"])
          .addBreakout(["field-id", ORDERS_PRODUCT_FK_FIELD_ID])
          .nest()
          .addFilter(["=", ["field-literal", "count", "type/Integer"], 42]);
        expect(q.clean().query()).toEqual(q.query());
        expect(q.clean() === q).toBe(true);
      });

      it("should remove unecessary layers of nesting via query()", () => {
        const q = makeStructuredQuery().nest();
        expect(q.clean().query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      });

      it("should remove unecessary layers of nesting via question()", () => {
        const q = makeStructuredQuery().nest();
        expect(
          q
            .clean()
            .question()
            .card().dataset_query.query,
        ).toEqual({ "source-table": ORDERS_TABLE_ID });
      });

      it("should remove clauses dependent on removed clauses in the parent", () => {
        const q = makeStructuredQuery()
          .addBreakout(["field-id", ORDERS_PRODUCT_FK_FIELD_ID])
          .nest()
          .addFilter(["=", ["field-literal", "count", "type/Integer"], 42]);
        expect(q.clean().query()).toEqual({
          breakout: [["field-id", ORDERS_PRODUCT_FK_FIELD_ID]],
          "source-table": ORDERS_TABLE_ID,
        });
      });
    });
  });
});
