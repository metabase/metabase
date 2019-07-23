import {
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

import Dimension from "metabase-lib/lib/Dimension";

const filter = ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42];
const q = makeStructuredQuery({ filter: filter });

describe("StructuredQuery", () => {
  describe("hasFilters", () => {
    it("should return false for queries without filters", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(q.hasFilters()).toBe(false);
    });
    it("should return true for queries with filters", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
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
        expect(f.dimension().mbql()).toEqual([
          "field-id",
          ORDERS_TOTAL_FIELD_ID,
        ]);
      });
    });
    describe("field()", () => {
      it("should return the correct field", () => {
        const f = q.filters()[0];
        expect(f.field().id).toEqual(ORDERS_TOTAL_FIELD_ID);
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
        expect(f.isDimension(["field-id", ORDERS_TOTAL_FIELD_ID])).toBe(true);
        expect(
          f.isDimension(
            Dimension.parseMBQL(["field-id", ORDERS_TOTAL_FIELD_ID]),
          ),
        ).toBe(true);
      });
      it("should return false for different dimensions", () => {
        const f = q.filters()[0];
        expect(f.isDimension(["field-id", PRODUCT_TILE_FIELD_ID])).toBe(false);
        expect(
          f.isDimension(
            Dimension.parseMBQL(["field-id", PRODUCT_TILE_FIELD_ID]),
          ),
        ).toBe(false);
      });
    });
  });
});
