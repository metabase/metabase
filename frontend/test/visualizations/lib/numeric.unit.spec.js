import {
  precision,
  computeNumericDataInverval,
} from "metabase/visualizations/lib/numeric";

describe("visualization.lib.numeric", () => {
  describe("precision", () => {
    const CASES = [
      [0, 0],
      [10, 10],
      [-10, 10],
      [1, 1],
      [-1, 1],
      [0.1, 0.1],
      [-0.1, 0.1],
      [0.01, 0.01],
      [-0.01, 0.01],
      [1.1, 0.1],
      [-1.1, 0.1],
      [0.5, 0.1],
      [0.9, 0.1],
      [-0.5, 0.1],
      [-0.9, 0.1],
    ];
    for (const c of CASES) {
      it("precision of " + c[0] + " should be " + c[1], () => {
        expect(precision(c[0])).toEqual(c[1]);
      });
    }
  });
  describe("computeNumericDataInverval", () => {
    const CASES = [
      [[0], 1],
      [[1], 1],
      [[0, 1], 1],
      [[0.1, 1], 0.1],
      [[0.1, 10], 0.1],
      [[10, 1], 1],
      [[0, null, 1], 1],
    ];
    for (const c of CASES) {
      it("precision of " + c[0] + " should be " + c[1], () => {
        expect(computeNumericDataInverval(c[0])).toEqual(c[1]);
      });
    }
  });
});
