import { drillFilter } from "metabase/modes/lib/actions";
import { ORDERS } from "__support__/sample_database_fixture";

describe("actions", () => {
  describe("drillFilter", () => {
    it("should include time temporal units smaller than a day", () => {
      ["minute", "hour"].map(temporalUnit => {
        const newQuery = drillFilter(
          ORDERS.query(),
          "2018-04-27T00:00:00",
          ORDERS.CREATED_AT.column({
            unit: temporalUnit,
          }),
        );
        expect(newQuery.query()).toEqual({
          "source-table": ORDERS.id,
          filter: [
            "=",
            ["field", ORDERS.CREATED_AT.id, { "temporal-unit": temporalUnit }],
            "2018-04-27T00:00:00",
          ],
        });
      });
    });
  });

  it("should not include time temporal units greater than a hour", () => {
    ["day", "week", "month", "quarter", "year"].map(temporalUnit => {
      const newQuery = drillFilter(
        ORDERS.query(),
        "2018-04-27T00:00:00",
        ORDERS.CREATED_AT.column({
          unit: temporalUnit,
        }),
      );
      expect(newQuery.query()).toEqual({
        "source-table": ORDERS.id,
        filter: [
          "=",
          ["field", ORDERS.CREATED_AT.id, { "temporal-unit": temporalUnit }],
          "2018-04-27",
        ],
      });
    });
  });
});
