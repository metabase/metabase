/* eslint-disable flowtype/require-valid-file-annotation */

import { drillFilter } from "metabase/modes/lib/actions";
import { ORDERS } from "__support__/sample_dataset_fixture";

describe("actions", () => {
  describe("drillFilter", () => {
    it("should add the filter with the same timezone", () => {
      const newCard = drillFilter(
        {
          dataset_query: {
            type: "query",
            query: {},
          },
        },
        "2018-04-27T00:00:00.000+02:00",
        ORDERS.CREATED_AT.column({
          unit: "day",
        }),
      );
      expect(newCard.dataset_query.query).toEqual({
        filter: [
          "=",
          ["datetime-field", ["field-id", ORDERS.CREATED_AT.id], "day"],
          "2018-04-27T00:00:00+02:00",
        ],
      });
    });
  });
});
