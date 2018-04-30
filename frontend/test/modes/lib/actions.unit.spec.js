/* eslint-disable flowtype/require-valid-file-annotation */

import { drillFilter } from "metabase/qb/lib/actions";

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
        {
          base_type: "type/DateTime",
          id: 123,
          unit: "day",
        },
      );
      expect(newCard.dataset_query.query).toEqual({
        filter: [
          "=",
          ["datetime-field", ["field-id", 123], "as", "day"],
          "2018-04-27T00:00:00+02:00",
        ],
      });
    });
  });
});
