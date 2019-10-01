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
});
