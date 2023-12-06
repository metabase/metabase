import {
  computeChange,
  computeTrend,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { COMPARISON_TYPES } from "./utils";

describe("SmartScalar > compute", () => {
  describe("computeChange", () => {
    it("should evaluate: 0 → - = -∞%", () => {
      expect(computeChange(0, -1)).toBe(-Infinity);
      expect(computeChange(0, -10)).toBe(-Infinity);
    });
    it("should evaluate: 0 → + =  ∞%", () => {
      expect(computeChange(0, 1)).toBe(Infinity);
      expect(computeChange(0, 10)).toBe(Infinity);
    });
    it("should evaluate: 0 → 0 =  0%", () => {
      expect(computeChange(0, 0)).toBe(0);
    });
    it("should evaluate: - → 0 = 100%", () => {
      expect(computeChange(-1, 0)).toBe(1);
      expect(computeChange(-10, 0)).toBe(1);
    });
    it("should evaluate: + → 0 = -100%", () => {
      expect(computeChange(1, 0)).toBe(-1);
      expect(computeChange(10, 0)).toBe(-1);
    });
    it("should evaluate: + → + = (nextVal - prevVal) / Math.abs(prevVal)", () => {
      expect(computeChange(3, 5)).toBe((5 - 3) / Math.abs(3));
      expect(computeChange(12, 3)).toBe((3 - 12) / Math.abs(12));
    });
    it("should evaluate: + → - = (nextVal - prevVal) / Math.abs(prevVal)", () => {
      expect(computeChange(3, -5)).toBe((-5 - 3) / Math.abs(3));
      expect(computeChange(12, -3)).toBe((-3 - 12) / Math.abs(12));
    });
    it("should evaluate: - → - =  (nextVal - prevVal) / Math.abs(prevVal)", () => {
      expect(computeChange(-3, -5)).toBe((-5 - -3) / Math.abs(-3));
      expect(computeChange(-12, -3)).toBe((-3 - -12) / Math.abs(-12));
    });
    it("should evaluate: - → + = (nextVal - prevVal) / Math.abs(prevVal)", () => {
      expect(computeChange(-3, 5)).toBe((5 - -3) / Math.abs(-3));
      expect(computeChange(-12, 3)).toBe((3 - -12) / Math.abs(-12));
    });
  });

  describe("computeTrend", () => {
    const changeArrowIconMap = { arrow_down: "↓", arrow_up: "↑" };

    const printComparison = ({
      comparisonPeriodStr,
      changeArrowIconName,
      display: { percentChange, prevValue },
    }) =>
      [
        changeArrowIconMap[changeArrowIconName],
        percentChange,
        [comparisonPeriodStr, prevValue].filter(e => e).join(": "),
      ]
        .filter(e => e)
        .join(" ");
    const printTrend = ({ display: { value, date }, comparison }) =>
      [value, date, printComparison(comparison)].join("; ");

    const cols = [
      DateTimeColumn({ name: "Month" }),
      NumberColumn({ name: "Count" }),
      NumberColumn({ name: "Sum" }),
    ];
    const series = ({ rows }) => [{ data: { rows, cols } }];

    describe(`comparisonType: ${COMPARISON_TYPES.COMPARE_TO_PREVIOUS}`, () => {
      const settings = {
        "scalar.field": "Count",
        "scalar.comparisons": { type: COMPARISON_TYPES.COMPARE_TO_PREVIOUS },
      };

      const testCases = [
        {
          description: "should correctly display percent increase",
          rows: [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Nov 2019; ↑ 200% vs. previous month: 100",
        },
        {
          description: "should correctly display percent decrease",
          rows: [
            ["2019-10-01", 300],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: "100; Nov 2019; ↓ 66.67% vs. previous month: 300",
        },
        {
          description: "should correctly display no change",
          rows: [
            ["2019-10-01", 100],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: "100; Nov 2019; No change vs. previous month",
        },
        {
          description: "should correctly display infinite increase",
          rows: [
            ["2019-10-01", 0],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Nov 2019; ↑ ∞% vs. previous month: 0",
        },
        {
          description:
            "should correctly display missing data if previous value is null",
          rows: [
            ["2019-09-01", null],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Nov 2019; N/A (No data)",
        },
        {
          description: "should correctly display missing data for single row",
          rows: [["2019-11-01", 300]],
          dateUnit: "month",
          expected: "300; Nov 2019; N/A (No data)",
        },
        {
          description:
            "should correctly display percent decrease over missing row",
          rows: [
            ["2019-09-01", 300],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: "100; Nov 2019; ↓ 66.67% vs. Sep: 300",
        },
        {
          description:
            "should correctly display percent decrease over null data",
          rows: [
            ["2019-09-01", 300],
            ["2019-10-01", null],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: "100; Nov 2019; ↓ 66.67% vs. Sep: 300",
        },
        {
          description:
            "should correctly fallback to day unit if backend doesn’t return valid unit",
          rows: [
            ["2018-09-01", 100],
            ["2019-11-01", 300],
          ],
          dateUnit: null,
          expected: "300; Nov 1, 2019; ↑ 200% vs. Sep 1, 2018: 100",
        },
      ];

      it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
        const insights = [
          { unit: dateUnit, col: "Count" },
          { unit: dateUnit, col: "Sum" },
        ];
        const trend = computeTrend(series({ rows }), insights, settings);
        expect(printTrend(trend)).toBe(expected);
      });
    });

    describe(`comparisonType: ${COMPARISON_TYPES.PREVIOUS_PERIOD}`, () => {
      const settings = {
        "scalar.field": "Count",
        "scalar.comparisons": { type: COMPARISON_TYPES.PREVIOUS_PERIOD },
      };

      const testCases = [
        {
          description: "should correctly display previous year comparison",
          rows: [
            ["2018-01-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "year",
          expected: "300; 2019; ↑ 200% vs. previous year: 100",
        },
        {
          description: "should correctly display previous month comparison",
          rows: [
            ["2018-12-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Jan 2019; ↑ 200% vs. previous month: 100",
        },
        {
          description: "should correctly display previous week comparison",
          rows: [
            ["2019-01-01", 100],
            ["2019-01-08", 300],
          ],
          dateUnit: "week",
          expected: "300; Jan 8–14, 2019; ↑ 200% vs. previous week: 100",
        },
        {
          description: "should correctly display previous day comparison",
          rows: [
            ["2019-01-01", 100],
            ["2019-01-02", 300],
          ],
          dateUnit: "day",
          expected: "300; Jan 2, 2019; ↑ 200% vs. previous day: 100",
        },
        {
          description: "should correctly display previous hour comparison",
          rows: [
            ["2019-01-02T09:00", 100],
            ["2019-01-02T10:00", 300],
          ],
          dateUnit: "hour",
          expected:
            "300; Jan 2, 2019, 10:00–59 AM; ↑ 200% vs. previous hour: 100",
        },
        {
          description: "should correctly display previous minute comparison",
          rows: [
            ["2019-01-02T09:59", 100],
            ["2019-01-02T10:00", 300],
          ],
          dateUnit: "minute",
          expected:
            "300; Jan 2, 2019, 10:00 AM; ↑ 200% vs. previous minute: 100",
        },
        {
          description:
            "should correctly display N/A if missing previous period",
          rows: [
            ["2017-01-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "year",
          expected: "300; 2019; N/A vs. previous year: (No data)",
        },
      ];

      it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
        const insights = [
          { unit: dateUnit, col: "Count" },
          { unit: dateUnit, col: "Sum" },
        ];
        const trend = computeTrend(series({ rows }), insights, settings);
        expect(printTrend(trend)).toBe(expected);
      });
    });

    describe(`comparisonType: ${COMPARISON_TYPES.PERIODS_AGO}`, () => {
      const settings = {
        "scalar.field": "Count",
        "scalar.comparisons": { type: COMPARISON_TYPES.PERIODS_AGO },
      };

      const testCases = [
        {
          description: "should correctly display previous year comparison",
          rows: [
            ["2018-01-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "year",
          expected: "300; 2019; ↑ 200% vs. previous year: 100",
        },
        {
          description: "should correctly display previous month comparison",
          rows: [
            ["2018-12-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Jan 2019; ↑ 200% vs. previous month: 100",
        },
        {
          description: "should correctly display previous week comparison",
          rows: [
            ["2019-01-01", 100],
            ["2019-01-08", 300],
          ],
          dateUnit: "week",
          expected: "300; Jan 8–14, 2019; ↑ 200% vs. previous week: 100",
        },
        {
          description: "should correctly display previous day comparison",
          rows: [
            ["2019-01-01", 100],
            ["2019-01-02", 300],
          ],
          dateUnit: "day",
          expected: "300; Jan 2, 2019; ↑ 200% vs. previous day: 100",
        },
        {
          description: "should correctly display previous hour comparison",
          rows: [
            ["2019-01-02T09:00", 100],
            ["2019-01-02T10:00", 300],
          ],
          dateUnit: "hour",
          expected:
            "300; Jan 2, 2019, 10:00–59 AM; ↑ 200% vs. previous hour: 100",
        },
        {
          description: "should correctly display previous minute comparison",
          rows: [
            ["2019-01-02T09:59", 100],
            ["2019-01-02T10:00", 300],
          ],
          dateUnit: "minute",
          expected:
            "300; Jan 2, 2019, 10:00 AM; ↑ 200% vs. previous minute: 100",
        },
        {
          description:
            "should correctly display N/A if missing previous period",
          rows: [
            ["2017-01-01", 100],
            ["2019-01-01", 300],
          ],
          dateUnit: "year",
          expected: "300; 2019; N/A vs. previous year: (No data)",
        },
      ];

      it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
        const insights = [
          { unit: dateUnit, col: "Count" },
          { unit: dateUnit, col: "Sum" },
        ];
        const trend = computeTrend(series({ rows }), insights, settings);
        expect(printTrend(trend)).toBe(expected);
      });
    });

    describe("should remove higher-order time periods for previous rows date", () => {
      const settings = {
        "scalar.field": "Count",
        "scalar.comparisons": { type: COMPARISON_TYPES.COMPARE_TO_PREVIOUS },
      };

      const testCases = [
        {
          description:
            "should not remove year when previous quarter and current quarter are different years",
          rows: [
            ["2023-10-01T00:00:00-04:00", 100],
            ["2024-10-01T00:00:00-04:00", 300],
          ],
          dateUnit: "quarter",
          expected: "300; Q4 2024; ↑ 200% vs. Q4 2023: 100",
        },
        {
          description:
            "should remove year when previous quarter and current quarter are within the same year",
          rows: [
            ["2024-04-01T00:00:00-04:00", 100],
            ["2024-10-01T00:00:00-04:00", 300],
          ],
          dateUnit: "quarter",
          expected: "300; Q4 2024; ↑ 200% vs. Q2: 100",
        },
        {
          description:
            "should not remove year when previous month and current month are in different years",
          rows: [
            ["2018-09-01", 100],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Nov 2019; ↑ 200% vs. Sep 2018: 100",
        },
        {
          description:
            "should remove year when previous month and current month are within the same year",
          rows: [
            ["2019-09-01", 100],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: "300; Nov 2019; ↑ 200% vs. Sep: 100",
        },
        {
          description:
            "should not remove year when previous week and current week are in different years",
          rows: [
            ["2022-11-05", 100],
            ["2023-11-19", 300],
          ],
          dateUnit: "week",
          expected: "300; Nov 19–25, 2023; ↑ 200% vs. Nov 5–11, 2022: 100",
        },
        {
          description:
            "should remove year when previous week and current week are within the same year",
          rows: [
            ["2023-11-05", 100],
            ["2023-11-19", 300],
          ],
          dateUnit: "week",
          expected: "300; Nov 19–25, 2023; ↑ 200% vs. Nov 5–11: 100",
        },
        {
          description:
            "should not remove year when previous day and current day are in different years",
          rows: [
            ["2018-10-01", 100],
            ["2019-11-05", 300],
          ],
          dateUnit: "day",
          expected: "300; Nov 5, 2019; ↑ 200% vs. Oct 1, 2018: 100",
        },
        {
          description:
            "should remove year when previous day and current day are within the same year",
          rows: [
            ["2019-10-10", 100],
            ["2019-11-05", 300],
          ],
          dateUnit: "day",
          expected: "300; Nov 5, 2019; ↑ 200% vs. Oct 10: 100",
        },
        {
          description:
            "should not remove year when previous hour and current hour are in different years",
          rows: [
            ["2018-10-10T04:00:00-04:00", 100],
            ["2019-11-05T04:00:00-04:00", 300],
          ],
          dateUnit: "hour",
          expected:
            "300; Nov 5, 2019, 4:00–59 AM; ↑ 200% vs. Oct 10, 2018, 4:00–59 AM: 100",
        },
        {
          description:
            "should remove year when previous hour and current hour are in the same year",
          rows: [
            ["2019-10-10T04:00:00-04:00", 100],
            ["2019-11-05T04:00:00-04:00", 300],
          ],
          dateUnit: "hour",
          expected:
            "300; Nov 5, 2019, 4:00–59 AM; ↑ 200% vs. Oct 10, 4:00–59 AM: 100",
        },
        {
          description:
            "should remove year and day when previous hour and current hour are in the same day",
          rows: [
            ["2019-11-05T04:00:00-04:00", 100],
            ["2019-11-05T10:00:00-04:00", 300],
          ],
          dateUnit: "hour",
          expected: "300; Nov 5, 2019, 10:00–59 AM; ↑ 200% vs. 4:00–59 AM: 100",
        },
        {
          description:
            "should not remove year when previous minute and current minute are in different years",
          rows: [
            ["2018-10-10T04:00:00-04:00", 100],
            ["2019-11-05T04:00:00-04:00", 300],
          ],
          dateUnit: "minute",
          expected:
            "300; Nov 5, 2019, 4:00 AM; ↑ 200% vs. Oct 10, 2018, 4:00 AM: 100",
        },
        {
          description:
            "should remove year when previous minute and current minute are in the same year",
          rows: [
            ["2019-10-10T04:00:00-04:00", 100],
            ["2019-11-05T04:00:00-04:00", 300],
          ],
          dateUnit: "minute",
          expected:
            "300; Nov 5, 2019, 4:00 AM; ↑ 200% vs. Oct 10, 4:00 AM: 100",
        },
        {
          description:
            "should remove year and day when previous minute and current minute are in the same day",
          rows: [
            ["2019-11-05T04:00:00-04:00", 100],
            ["2019-11-05T10:00:00-04:00", 300],
          ],
          dateUnit: "minute",
          expected: "300; Nov 5, 2019, 10:00 AM; ↑ 200% vs. 4:00 AM: 100",
        },
      ];

      it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
        const insights = [
          { unit: dateUnit, col: "Count" },
          { unit: dateUnit, col: "Sum" },
        ];
        const trend = computeTrend(series({ rows }), insights, settings);
        expect(printTrend(trend)).toBe(expected);
      });
    });
  });
});
