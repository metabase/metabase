import { getComparisonContributors } from "metabase/xray/selectors";

describe("xray selectors", () => {
  describe("getComparisonContributors", () => {
    it("should return the top contributors for a comparison", () => {
      const GOOD_FIELD = {
        field: {
          display_name: "good",
        },
        histogram: {
          label: "Distribution",
          value: {},
        },
      };

      const OTHER_FIELD = {
        field: {
          display_name: "other",
        },
        histogram: {
          label: "Distribution",
        },
      };

      const state = {
        xray: {
          comparison: {
            constituents: [
              {
                constituents: {
                  GOOD_FIELD,
                  OTHER_FIELD,
                },
              },
              {
                constituents: {
                  GOOD_FIELD,
                  OTHER_FIELD,
                },
              },
            ],
            "top-contributors": [
              {
                field: "GOOD_FIELD",
                feature: "histogram",
              },
            ],
          },
        },
      };

      const expected = [
        {
          feature: {
            label: "Distribution",
            type: "histogram",
            value: {
              a: {},
              b: {},
            },
          },
          field: GOOD_FIELD,
        },
      ];
      expect(getComparisonContributors(state)).toEqual(expected);
    });
  });
});
