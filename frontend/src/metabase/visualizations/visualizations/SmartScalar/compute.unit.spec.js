import {
  computeChange,
  computeTrend,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";

describe("SmartScalar > compute", () => {
  describe("computeChange", () => {
    // Tests from original clojure implementation:
    // https://github.com/metabase/metabase/blob/d2ecd17/src/metabase/sync/analyze/fingerprint/insights.clj#L32-L42
    //
    //  (defn change
    //    "Relative difference between `x1` an `x2`."
    //    [x2 x1]
    //    (when (and x1 x2 (not (zero? x1)))
    //      (let [x2 (double x2)
    //            x1 (double x1)]
    //        (cond
    //          (every? neg? [x1 x2])     (change (- x1) (- x2))
    //          (and (neg? x1) (pos? x2)) (- (change x1 x2))
    //          (neg? x1)                 (- (change x2 (- x1)))
    //          :else                     (/ (- x2 x1) x1)))))

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
    it("should evaluate: - → 0 = -100%", () => {
      expect(computeChange(-1, 0)).toBe(-1);
      expect(computeChange(-10, 0)).toBe(-1);
    });
    it("should evaluate: + → 0 = -100%", () => {
      expect(computeChange(1, 0)).toBe(-1);
      expect(computeChange(10, 0)).toBe(-1);
    });
    it("should evaluate: + → + = (b-a)/a", () => {
      expect(computeChange(3, 5)).toBe((5 - 3) / 3);
      expect(computeChange(12, 3)).toBe((3 - 12) / 12);
    });
    it("should evaluate: + → - = (b-a)/a", () => {
      expect(computeChange(3, -5)).toBe((-5 - 3) / 3);
      expect(computeChange(12, -3)).toBe((-3 - 12) / 12);
    });
    it("should evaluate: - → - =  [+ ← +]", () => {
      expect(computeChange(-3, -5)).toBe(computeChange(5, 3));
      expect(computeChange(-12, -3)).toBe(computeChange(3, 12));
    });
    it("should evaluate: - → + = -[- ← +]", () => {
      expect(computeChange(-3, 5)).toBe(-computeChange(5, -3));
      expect(computeChange(-12, 3)).toBe(-computeChange(3, -12));
    });
  });
  describe("computeTrend", () => {
    const printComparison = ({
      title,
      changeArrow,
      display: { change, value },
    }) =>
      [changeArrow, change, "vs.", [title, value].filter(e => e).join(": ")]
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
    const settings = { "scalar.field": "Count" };

    it.each([
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
        expected: "300; Nov 2019; N/A vs. previous month: (empty)",
      },
      {
        description: "should correctly display missing data for single row",
        rows: [["2019-11-01", 300]],
        dateUnit: "month",
        expected: "300; Nov 2019; N/A vs. previous month: (empty)",
      },
      {
        description:
          "should correctly display percent decrease over missing row",
        rows: [
          ["2019-09-01", 300],
          ["2019-11-01", 100],
        ],
        dateUnit: "month",
        expected: "100; Nov 2019; ↓ 66.67% vs. Sep 2019: 300",
      },
      {
        description: "should correctly display percent decrease over null data",
        rows: [
          ["2019-09-01", 300],
          ["2019-10-01", null],
          ["2019-11-01", 100],
        ],
        dateUnit: "month",
        expected: "100; Nov 2019; ↓ 66.67% vs. Sep 2019: 300",
      },
      {
        description:
          "should correctly fallback to day unit if backend doesn’t return valid unit",
        rows: [
          ["2019-09-01", 100],
          ["2019-11-01", 300],
        ],
        dateUnit: null,
        expected: "300; Nov 1, 2019; ↑ 200% vs. Sep 1, 2019: 100",
      },
    ])("$description", ({ rows, expected, dateUnit }) => {
      const insights = [
        { unit: dateUnit, col: "Count" },
        { unit: dateUnit, col: "Sum" },
      ];
      const trend = computeTrend(series({ rows }), insights, settings);
      expect(printTrend(trend)).toBe(expected);
    });
  });
});
