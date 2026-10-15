import type { GoalRefError } from "metabase/viz-core";

import { getGaugeWarnings, getSegmentsRange, getValue } from "./utils";

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
