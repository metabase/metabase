import {
  ORDERS,
  PRODUCTS,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

import Dimension from "metabase-lib/lib/Dimension";

const filter = ["=", ["field-id", ORDERS.TOTAL.id], 42];
const q = makeStructuredQuery({ filter: filter });

describe("StructuredQuery", () => {
  describe("hasFilters", () => {
    it("should return false for queries without filters", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS.id });
      expect(q.hasFilters()).toBe(false);
    });
    it("should return true for queries with filters", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS.id,
        filter: filter,
      });
      expect(q.hasFilters()).toBe(true);
    });
  });
  describe("filters", () => {
    it("should work as raw MBQL", () => {
      const f = q.filters()[0];
      expect(JSON.stringify(f)).toEqual(JSON.stringify(filter));
    });
    describe("dimension()", () => {
      it("should return the correct dimension", () => {
        const f = q.filters()[0];
        expect(f.dimension().mbql()).toEqual(["field-id", ORDERS.TOTAL.id]);
      });
    });
    describe("field()", () => {
      it("should return the correct field", () => {
        const f = q.filters()[0];
        expect(f.field().id).toEqual(ORDERS.TOTAL.id);
      });
    });
    describe("operator()", () => {
      it("should return the correct operator", () => {
        const f = q.filters()[0];
        expect(f.operator().name).toEqual("=");
      });
    });
    describe("operatorOptions", () => {
      it("should return the valid operators for number filter", () => {
        const f = q.filters()[0];
        expect(f.operatorOptions()).toHaveLength(9);
        expect(f.operatorOptions()[0].name).toEqual("=");
      });
    });
    describe("isOperator", () => {
      it("should return true for the same operator", () => {
        const f = q.filters()[0];
        expect(f.isOperator("=")).toBe(true);
        expect(f.isOperator(f.operatorOptions()[0])).toBe(true);
      });
      it("should return false for different operators", () => {
        const f = q.filters()[0];
        expect(f.isOperator("!=")).toBe(false);
        expect(f.isOperator(f.operatorOptions()[1])).toBe(false);
      });
    });
    describe("isDimension", () => {
      it("should return true for the same dimension", () => {
        const f = q.filters()[0];
        expect(f.isDimension(["field-id", ORDERS.TOTAL.id])).toBe(true);
        expect(
          f.isDimension(Dimension.parseMBQL(["field-id", ORDERS.TOTAL.id])),
        ).toBe(true);
      });
      it("should return false for different dimensions", () => {
        const f = q.filters()[0];
        expect(f.isDimension(["field-id", PRODUCTS.TITLE.id])).toBe(false);
        expect(
          f.isDimension(Dimension.parseMBQL(["field-id", PRODUCTS.TITLE.id])),
        ).toBe(false);
      });
    });
  });
});
