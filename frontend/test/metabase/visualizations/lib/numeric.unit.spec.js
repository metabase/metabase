import {
  precision,
  computeNumericDataInverval,
  isMultipleOf,
  getModuloScaleFactor,
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
  describe("getModuloScaleFactor", () => {
    [
      [0.01, 100],
      [0.05, 100],
      [0.1, 10],
      [1, 1],
      [2, 1],
      [10, 1],
      [10 ** 10, 1],
    ].map(([value, expected]) =>
      it(`should return ${expected} for ${value}`, () =>
        expect(getModuloScaleFactor(value)).toBe(expected)),
    );
  });
  describe("isMultipleOf", () => {
    [
      [1, 0.1, true],
      [1, 1, true],
      [10, 1, true],
      [1, 10, false],
      [3, 1, true],
      [0.3, 0.1, true],
      [0.25, 0.1, false],
      [0.000000001, 0.0000000001, true],
      [0.0000000001, 0.000000001, false],
    ].map(([value, base, expected]) =>
      it(`${value} ${expected ? "is" : "is not"} a multiple of ${base}`, () =>
        expect(isMultipleOf(value, base)).toBe(expected)),
    );
  });
});
