import { createMockMetadata } from "__support__/metadata";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [createMockMetric({ id: 1 })],
});

const db = metadata.database(SAMPLE_DB_ID);
const ordersTable = metadata.table(ORDERS_ID);

describe("StructuredQuery", () => {
  describe("clean", () => {
    it("should not return a new instance of the same query", () => {
      const q = ordersTable.legacyQuery({ useStructuredQuery: true });
      expect(q.clean() === q).toBe(true);
    });

    describe("filters", () => {
      it("should not remove filter referencing valid field ID", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(["=", ["field", ORDERS.TOTAL, null], 42]);
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
          q.legacyQuery({ useStructuredQuery: true }),
        );
        expect(q.clean() === q).toBe(true);
      });
    });

    describe("aggregations", () => {
      describe("standard aggregations", () => {
        it("should not remove count", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate(["count"]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });
        it("should not remove aggregation referencing valid field ID", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate(["avg", ["field", ORDERS.TOTAL, null]]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("named aggregations", () => {
        it("should not remove valid named aggregations", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate([
              "aggregation-options",
              ["count"],
              { "display-name": "foo" },
            ]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("metric aggregations", () => {
        it("should not remove valid metrics", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate(["metric", 1]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });
      });

      describe("custom aggregations", () => {
        it("should not remove count + 1", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate(["+", ["count"], 1]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });

        it("should not remove custom aggregation referencing valid field ID", () => {
          const q = ordersTable
            .legacyQuery({ useStructuredQuery: true })
            .aggregate(["+", ["avg", ["field", ORDERS.TOTAL, null]], 1]);
          expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
            q.legacyQuery({ useStructuredQuery: true }),
          );
          expect(q.clean() === q).toBe(true);
        });
      });
    });

    describe("breakouts", () => {
      it("should not remove breakout referencing valid field ID", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .breakout(["field", ORDERS.TOTAL, null]);
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
          q.legacyQuery({ useStructuredQuery: true }),
        );
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid expressions", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .addExpression("foo", ["field", ORDERS.TOTAL, null])
          .breakout(["expression", "foo"]);
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
          q.legacyQuery({ useStructuredQuery: true }),
        );
        expect(q.clean() === q).toBe(true);
      });
      it("should not remove breakout referencing valid fk", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .breakout([
            "field",
            PRODUCTS.TITLE,
            { "source-field": ORDERS.PRODUCT_ID },
          ]);
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
          q.legacyQuery({ useStructuredQuery: true }),
        );
        expect(q.clean() === q).toBe(true);
      });
    });

    describe("nested", () => {
      it("shouldn't modify valid nested queries", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .aggregate(["count"])
          .breakout(["field", ORDERS.PRODUCT_ID, null])
          .nest()
          .filter([
            "=",
            ["field", "count", { "base-type": "type/Integer" }],
            42,
          ]);
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual(
          q.legacyQuery({ useStructuredQuery: true }),
        );
        expect(q.clean() === q).toBe(true);
      });

      it("should remove unnecessary layers of nesting via legacyQuery()", () => {
        const q = ordersTable.legacyQuery({ useStructuredQuery: true }).nest();
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual({
          "source-table": ORDERS_ID,
        });
      });

      it("should remove unnecessary layers of nesting via question()", () => {
        const q = ordersTable.legacyQuery({ useStructuredQuery: true }).nest();
        expect(q.clean().legacyQuery({ useStructuredQuery: true })).toEqual({
          "source-table": ORDERS_ID,
        });
      });
    });
  });

  describe("cleanNesting", () => {
    it("should not modify empty queries with no source-query", () => {
      expect(
        db
          .question()
          .legacyQuery({ useStructuredQuery: true })
          .cleanNesting()
          .datasetQuery(),
      ).toEqual({
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": undefined },
      });
    });
  });
});
