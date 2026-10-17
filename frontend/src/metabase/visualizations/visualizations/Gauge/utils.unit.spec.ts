import type { GoalRefError } from "metabase/viz-core";

import {
  getGaugeWarnings,
  getLabelBox,
  getSegmentsRange,
  getValue,
  getWarningRadiusClearOfLabels,
} from "./utils";

const ERROR: GoalRefError = {
  type: "card",
  id: 9,
  column: "goal",
  reason: "query-failed",
};
const OTHER_ERROR: GoalRefError = { ...ERROR, reason: "not-a-number" };
const FAILED = { value: null, error: ERROR };

describe("getGaugeWarnings", () => {
  it("has no warnings when every bound resolves", () => {
    expect(
      getGaugeWarnings([{ value: 0 }, { value: 50 }, { value: null }], [0, 50]),
    ).toEqual([]);
  });

  it("places a warning halfway between the known bounds around a failed one", () => {
    // [0, 50] [50, failed] [failed, 100]
    expect(
      getGaugeWarnings(
        [
          { value: 0 },
          { value: 50 },
          { value: 50 },
          FAILED,
          { value: null, error: OTHER_ERROR },
          { value: 100 },
        ],
        [0, 100],
      ),
    ).toEqual([{ value: 75, errors: [ERROR, OTHER_ERROR] }]);
  });

  it("falls back to the range ends when no bound is known on a side", () => {
    expect(
      getGaugeWarnings(
        [FAILED, { value: 40 }, { value: 60 }, FAILED],
        [40, 60],
      ),
    ).toEqual([
      { value: 40, errors: [ERROR] },
      { value: 60, errors: [ERROR] },
    ]);
  });

  it("merges warnings that land on the same spot of the arc", () => {
    // [failed, 100] [0, 50] [60, failed]: only [0, 50] is drawn, so both
    // warnings are clamped to its end
    expect(
      getGaugeWarnings(
        [
          FAILED,
          { value: 100 },
          { value: 0 },
          { value: 50 },
          { value: 60 },
          { value: null, error: OTHER_ERROR },
        ],
        [0, 50],
      ),
    ).toEqual([{ value: 50, errors: [ERROR, OTHER_ERROR] }]);
  });

  it("ignores bounds left empty", () => {
    expect(
      getGaugeWarnings(
        [{ value: 0 }, { value: null }, FAILED, { value: 100 }],
        [0, 100],
      ),
    ).toEqual([{ value: 50, errors: [ERROR] }]);
  });
});

describe("getLabelBox", () => {
  it("extends a label on the right outward from its position", () => {
    expect(getLabelBox([10, -20], 6)).toEqual({
      left: 10,
      right: 16,
      top: -24,
      bottom: -19,
    });
  });

  it("extends a label on the left outward and shifts it down in the lower half", () => {
    expect(getLabelBox([-10, 20], 6)).toEqual({
      left: -16,
      right: -10,
      top: 18,
      bottom: 23,
    });
  });

  it("centers a label at the top", () => {
    expect(getLabelBox([0, -20], 6)).toEqual({
      left: -3,
      right: 3,
      top: -24,
      bottom: -19,
    });
  });
});

describe("getWarningRadiusClearOfLabels", () => {
  const RIGHT: [number, number] = [1, 0];
  const LABEL = { left: 45, right: 55, top: -4, bottom: 1 };

  it("keeps the radius when the icon doesn't overlap any label", () => {
    expect(
      getWarningRadiusClearOfLabels(RIGHT, 46, 4, [
        { ...LABEL, top: 10, bottom: 15 },
      ]),
    ).toBe(46);
  });

  it("moves the icon past an overlapped label with a gap", () => {
    // the icon's left edge lands 1 past the label's right edge
    expect(getWarningRadiusClearOfLabels(RIGHT, 46, 4, [LABEL])).toBe(58);
  });

  it("keeps moving the icon past labels it runs into", () => {
    expect(
      getWarningRadiusClearOfLabels(RIGHT, 46, 4, [
        LABEL,
        { ...LABEL, left: 57, right: 60 },
      ]),
    ).toBe(63);
  });
});

describe("getSegmentsRange", () => {
  it("spans the extremes of all segment bounds", () => {
    expect(
      getSegmentsRange([
        { min: 20, max: 100, color: "red" },
        { min: -10, max: 60, color: "blue" },
      ]),
    ).toEqual([-10, 100]);
  });

  it("returns null without segments", () => {
    expect(getSegmentsRange([])).toBeNull();
  });
});

describe("Visualizations > Gauge > utils", () => {
  const valueTestCases = [
    [[[null]], 0],
    [[[undefined]], 0],
    [[["foo"]], 0],
    [[[""]], 0],
    [[[0]], 0],
    [[[1]], 1],
    [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      1,
    ],
    [[3], 0],
    [[["Infinity"]], Infinity],
  ];

  valueTestCases.forEach(([input, output]) => {
    it(`should return ${output} for ${JSON.stringify(input)}`, () => {
      // Unjustified type cast. FIXME
      expect(getValue(input as unknown[][])).toEqual(output);
    });
  });
});
