import type { GoalRefError } from "metabase/viz-core";

import { getGaugeWarningValues, getSegmentsRange, getValue } from "./utils";

const ERROR: GoalRefError = {
  type: "card",
  id: 9,
  column: "goal",
  reason: "query-failed",
};
const OTHER_ERROR: GoalRefError = { ...ERROR, reason: "not-a-number" };
const FAILED = { value: null, error: ERROR };

describe("getGaugeWarningValues", () => {
  it("has no warnings when every bound resolves", () => {
    expect(
      getGaugeWarningValues(
        [{ value: 0 }, { value: 50 }, { value: 50 }, { value: null }],
        [0, 50],
      ),
    ).toEqual([]);
  });

  it("places a warning halfway between the known bounds around a failed one", () => {
    // [0, 50] [50, failed] [failed, 100]
    expect(
      getGaugeWarningValues(
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
    ).toEqual([75]);
  });

  it("falls back to the range ends when no bound is known on a side", () => {
    expect(
      getGaugeWarningValues(
        [FAILED, { value: 40 }, { value: 60 }, FAILED],
        [40, 60],
      ),
    ).toEqual([40, 60]);
  });

  it("merges warnings that land on the same spot of the arc", () => {
    // [failed, 100] [0, 50] [60, failed]: only [0, 50] is drawn, so both warnings are clamped to its end
    expect(
      getGaugeWarningValues(
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
    ).toEqual([50]);
  });

  it("places a warning next to the known bound of its own segment regardless of segment order", () => {
    // [50, failed] [0, 50]: the failed segment continues past 50, not inside [0, 50]
    expect(
      getGaugeWarningValues(
        [{ value: 50 }, FAILED, { value: 0 }, { value: 50 }],
        [0, 100],
      ),
    ).toEqual([75]);
  });

  it("places a warning past the last known bound when no bound of the segment is known", () => {
    // [failed, failed] [0, 20]
    expect(
      getGaugeWarningValues(
        [
          FAILED,
          { value: null, error: OTHER_ERROR },
          { value: 0 },
          { value: 20 },
        ],
        [0, 100],
      ),
    ).toEqual([60]);
  });

  it("places a warning in the middle of the arc when no bound is known", () => {
    expect(getGaugeWarningValues([FAILED, FAILED], [0, 100])).toEqual([50]);
  });

  it("ignores bounds left empty", () => {
    expect(
      getGaugeWarningValues(
        [{ value: 0 }, { value: null }, FAILED, { value: 100 }],
        [0, 100],
      ),
    ).toEqual([50]);
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
