/* eslint-disable flowtype/require-valid-file-annotation */

import { drillFilter } from "metabase/modes/lib/actions";
import { ORDERS } from "__support__/sample_dataset_fixture";

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
          ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day"],
          "2018-04-27T00:00:00+02:00",
        ],
      });
    });
  });
});
