import {
  calcAvailableDonutSliceLabelLength,
  calcChordLength,
  calcCircleIntersectionByHorizontalLine,
  calcInnerOuterRadiusesForRing,
  getCoordOnCircle,
} from "metabase/visualizations/echarts/pie/util/label";

describe("pie chart label utilities", () => {
  describe("calcChordLength", () => {
    it("calculates chord length correctly", () => {
      expect(calcChordLength(5, Math.PI / 2)).toBeCloseTo(7.071, 3);
      expect(calcChordLength(10, Math.PI)).toBeCloseTo(20, 3);
    });

    it("handles zero angle", () => {
      expect(calcChordLength(5, 0)).toBeCloseTo(0, 3);
    });

    it("handles full circle", () => {
      expect(calcChordLength(5, 2 * Math.PI)).toBeCloseTo(0, 3);
    });
  });

  describe("getCoordOnCircle", () => {
    it("calculates coordinates on circle correctly", () => {
      expect(getCoordOnCircle(1, 0)).toEqual([0, 1]);
      expect(getCoordOnCircle(1, Math.PI / 2)).toEqual([
        expect.closeTo(1, 5),
        expect.closeTo(0, 5),
      ]);
    });

    it("handles negative angles", () => {
      expect(getCoordOnCircle(1, -Math.PI / 2)).toEqual([
        expect.closeTo(-1, 5),
        expect.closeTo(0, 5),
      ]);
    });

    it("handles angles greater than 2π", () => {
      expect(getCoordOnCircle(1, (5 * Math.PI) / 2)).toEqual([
        expect.closeTo(1, 5),
        expect.closeTo(0, 5),
      ]);
    });
  });

  describe("calcCircleIntersectionByHorizontalLine", () => {
    it("returns empty array when no intersection", () => {
      expect(calcCircleIntersectionByHorizontalLine(5, 6)).toEqual([]);
      expect(calcCircleIntersectionByHorizontalLine(5, -6)).toEqual([]);
    });

    it("returns one point when tangent", () => {
      expect(calcCircleIntersectionByHorizontalLine(5, 5)).toEqual([[0, 5]]);
      expect(calcCircleIntersectionByHorizontalLine(5, -5)).toEqual([[0, -5]]);
    });

    it("returns two points when intersecting", () => {
      const result = calcCircleIntersectionByHorizontalLine(5, 3);
      expect(result.length).toBe(2);
      expect(result[0]?.[0]).toBeCloseTo(-4, 1);
      expect(result[0]?.[1]).toBe(3);
      expect(result[1]?.[0]).toBeCloseTo(4, 1);
      expect(result[1]?.[1]).toBe(3);
    });

    it("handles y = 0 (horizontal diameter)", () => {
      const result = calcCircleIntersectionByHorizontalLine(5, 0);
      expect(result).toEqual([
        [-5, 0],
        [5, 0],
      ]);
    });
  });

  describe("calcAvailableDonutSliceLabelLength", () => {
    it("returns 0 when outer radius is not bigger than inner radius", () => {
      expect(
        calcAvailableDonutSliceLabelLength(
          5,
          5,
          0,
          Math.PI / 2,
          12,
          "horizontal",
        ),
      ).toBe(0);

      expect(
        calcAvailableDonutSliceLabelLength(
          10,
          5,
          0,
          Math.PI / 2,
          12,
          "horizontal",
        ),
      ).toBe(0);
    });

    it.each([50, 100])(
      "returns 0 when donut thickness is less than the double of the label font size",
      fontSize => {
        expect(
          calcAvailableDonutSliceLabelLength(
            50,
            100,
            0,
            Math.PI / 2,
            fontSize,
            "horizontal",
          ),
        ).toBe(0);
      },
    );

    it("calculates radial label length correctly", () => {
      const result = calcAvailableDonutSliceLabelLength(
        50,
        100,
        0,
        Math.PI / 2,
        12,
        "radial",
      );
      expect(result).toBe(50); // donutThickness
    });

    it("returns 0 for radial label when inner chord length is less than font size", () => {
      const result = calcAvailableDonutSliceLabelLength(
        50,
        100,
        0,
        Math.PI / 16,
        60,
        "radial",
      );
      expect(result).toBe(0);
    });

    it("calculates horizontal label length correctly", () => {
      const result = calcAvailableDonutSliceLabelLength(
        50,
        100,
        0,
        Math.PI / 4,
        12,
        "horizontal",
      );
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(50);
    });

    it("handles very small angles for horizontal label", () => {
      const result = calcAvailableDonutSliceLabelLength(
        50,
        100,
        0,
        0.01,
        12,
        "horizontal",
      );
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(50);
    });
  });

  describe("calcInnerOuterRadiusesForRing", () => {
    it("calculates inner and outer radiuses correctly for first ring", () => {
      const result = calcInnerOuterRadiusesForRing(50, 100, 2, 1);
      expect(result).toEqual({ inner: 50, outer: 75 });
    });

    it("calculates inner and outer radiuses correctly for second ring", () => {
      const result = calcInnerOuterRadiusesForRing(50, 100, 2, 2);
      expect(result).toEqual({ inner: 75, outer: 100 });
    });
  });
});
