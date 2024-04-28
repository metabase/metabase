import { createMockMetadata } from "__support__/metadata";
import Dimension from "metabase-lib/v1/Dimension";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

const FILTER = ["=", ["field", ORDERS.TOTAL, null], 42];

describe("StructuredQuery", () => {
  describe("filters", () => {
    it("should work as raw MBQL", () => {
      const q = ordersTable
        .legacyQuery({ useStructuredQuery: true })
        .filter(FILTER);
      const f = q.filters()[0];
      expect(JSON.stringify(f)).toEqual(JSON.stringify(FILTER));
    });
    describe("dimension()", () => {
      it("should return the correct dimension", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.dimension().mbql()).toEqual(["field", ORDERS.TOTAL, null]);
      });
    });
    describe("field()", () => {
      it("should return the correct field", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.field().id).toEqual(ORDERS.TOTAL);
      });
    });
    describe("operator()", () => {
      it("should return the correct operator", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.operator().name).toEqual("=");
      });
    });
    describe("filterOperators", () => {
      it("should return the valid operators for number filter", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.filterOperators()).toHaveLength(9);
        expect(f.filterOperators()[0].name).toEqual("=");
      });
    });
    describe("isOperator", () => {
      it("should return true for the same operator", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.isOperator("=")).toBe(true);
        expect(f.isOperator(f.filterOperators()[0])).toBe(true);
      });
      it("should return false for different operators", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.isOperator("!=")).toBe(false);
        expect(f.isOperator(f.filterOperators()[1])).toBe(false);
      });
    });
    describe("isDimension", () => {
      it("should return true for the same dimension", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.isDimension(["field", ORDERS.TOTAL, null])).toBe(true);
        expect(
          f.isDimension(Dimension.parseMBQL(["field", ORDERS.TOTAL, null])),
        ).toBe(true);
      });
      it("should return false for different dimensions", () => {
        const q = ordersTable
          .legacyQuery({ useStructuredQuery: true })
          .filter(FILTER);
        const f = q.filters()[0];
        expect(f.isDimension(["field", PRODUCTS.TITLE, null])).toBe(false);
        expect(
          f.isDimension(Dimension.parseMBQL(["field", PRODUCTS.TITLE, null])),
        ).toBe(false);
      });
    });
  });
});
