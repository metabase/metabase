import { ORDERS } from "__support__/sample_database_fixture";
import { drillFilter } from "metabase-lib/queries/utils/actions";

describe("actions", () => {
  describe("drillFilter", () => {
    it("should add the filter with the same timezone", () => {
      const newQuery = drillFilter(
        ORDERS.query(),
        "2018-04-27T00:00:00.000+02:00",
        ORDERS.CREATED_AT.column({
          unit: "day",
        }),
      );
      expect(newQuery.query()).toEqual({
        "source-table": ORDERS.id,
        filter: [
          "=",
          ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day" }],
          "2018-04-27T00:00:00+02:00",
        ],
      });
    });
  });
});
