import { getSegmentsRange, getValue } from "./utils";

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
