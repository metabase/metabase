import Filter from "metabase-lib/lib/queries/structured/Filter";

import {
  question,
  ORDERS_TOTAL_FIELD_ID,
} from "__support__/sample_dataset_fixture";

const query = question.query();

function filterForMBQL(mbql) {
  return new Filter(mbql, 0, query);
}

describe("Filter", () => {
  describe("displayName", () => {
    it("should return the correct string for an = filter", () => {
      expect(
        filterForMBQL([
          "=",
          ["field-id", ORDERS_TOTAL_FIELD_ID],
          42,
        ]).displayName(),
      ).toEqual("Total is equal to 42");
    });
    it("should return the correct string for a segment filter", () => {
      expect(filterForMBQL(["segment", 1]).displayName()).toEqual(
        "Expensive Things",
      );
    });
  });
});
