import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import registerVisualizations from "metabase/visualizations/register";
import { TYPE } from "metabase-lib/v1/types/constants";

registerVisualizations();

describe("visualization.lib.timeseries", () => {
  describe("dimensionIsTimeseries", () => {
    // examples from https://en.wikipedia.org/wiki/ISO_8601
    const ISO_8601_DATES = [
      "2016-02-12",
      "2016-02-12T03:21:55+00:00",
      "2016-02-12T03:21:55Z",
      "20160212T032155Z",
      "2016-W06",
      "2016-W06-5",
      "2016-043",
      "2024-06-28 00:00:00",
      19210413,
    ];

    const NOT_DATES = ["100", "100 %", "scanner 005", 99999999];

    it("should detect Date column as timeseries", () => {
      expect(dimensionIsTimeseries({ cols: [{ base_type: TYPE.Date }] })).toBe(
        true,
      );
    });

    it("should detect Time column as timeseries", () => {
      expect(dimensionIsTimeseries({ cols: [{ base_type: TYPE.Time }] })).toBe(
        true,
      );
    });

    it("should detect DateTime column as timeseries", () => {
      expect(
        dimensionIsTimeseries({ cols: [{ base_type: TYPE.DateTime }] }),
      ).toBe(true);
    });

    ISO_8601_DATES.forEach((isoDate) => {
      it(
        "should detect values with ISO 8601 formatted string '" +
          isoDate +
          "' as timeseries",
        () => {
          expect(
            dimensionIsTimeseries({
              cols: [{ base_type: TYPE.Text }],
              rows: [[isoDate]],
            }),
          ).toBe(true);
        },
      );
    });
    NOT_DATES.forEach((notDate) => {
      it("should not detect value '" + notDate + "' as timeseries", () => {
        expect(
          dimensionIsTimeseries({
            cols: [{ base_type: TYPE.Text }],
            rows: [[notDate]],
          }),
        ).toBe(false);
      });
    });

    it("should detect integer values in YYYYMMDD format as timeseries", () => {
      expect(
        dimensionIsTimeseries({
          cols: [{ base_type: TYPE.Integer }],
          rows: [[19210413], [20210413]],
        }),
      ).toBe(true);
    });

    it("should not detect integer values that are not valid dates as timeseries", () => {
      expect(
        dimensionIsTimeseries({
          cols: [{ base_type: TYPE.Integer }],
          rows: [[99999999], [12345678]],
        }),
      ).toBe(false);
    });
  });
});
