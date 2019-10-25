import Filter from "metabase-lib/lib/queries/structured/Filter";

import { ORDERS } from "__support__/sample_dataset_fixture";

const query = ORDERS.query();

function filterForMBQL(mbql) {
  return new Filter(mbql, 0, query);
}

describe("Filter", () => {
  describe("displayName", () => {
    it("should return the correct string for an = filter", () => {
      expect(
        filterForMBQL(["=", ["field-id", ORDERS.TOTAL.id], 42]).displayName(),
      ).toEqual("Total is equal to 42");
    });
    it("should return the correct string for a segment filter", () => {
      expect(filterForMBQL(["segment", 1]).displayName()).toEqual(
        "Expensive Things",
      );
    });
  });
  describe("isValid", () => {
    describe("with a field filter", () => {
      it("should return true for a field that exists", () => {
        expect(
          filterForMBQL(["=", ["field-id", ORDERS.TOTAL.id], 42]).isValid(),
        ).toBe(true);
      });
      it("should return false for a field that doesn't exists", () => {
        expect(filterForMBQL(["=", ["field-id", 12341234], 42]).isValid()).toBe(
          false,
        );
      });
    });
  });
  describe("operator", () => {
    it("should return the correct FilterOperator", () => {
      expect(
        filterForMBQL(["=", ["field-id", ORDERS.TOTAL.id], 42]).operator().name,
      ).toBe("=");
    });
  });
});
