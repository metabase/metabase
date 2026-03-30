import { computeLabelFontSize, getValue } from "./utils";

describe("Visualizations > Progress > utils", () => {
  describe("computeLabelFontSize", () => {
    it("should return minimum font size for small components", () => {
      expect(computeLabelFontSize(80)).toBe(14);
      expect(computeLabelFontSize(100)).toBe(14);
      expect(computeLabelFontSize(140)).toBe(14);
    });

    it("should scale font size with component height", () => {
      expect(computeLabelFontSize(200)).toBe(20);
      expect(computeLabelFontSize(250)).toBe(25);
      expect(computeLabelFontSize(300)).toBe(30);
    });

    it("should cap font size at maximum for large components", () => {
      expect(computeLabelFontSize(400)).toBe(36);
      expect(computeLabelFontSize(600)).toBe(36);
    });
  });

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
      expect(getValue(input as any)).toEqual(output);
    });
  });
});
