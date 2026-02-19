import { getAxisTransforms } from "./transforms";

describe("getAxisTransforms", () => {
  describe("log scale", () => {
    const { toEChartsAxisValue, fromEChartsAxisValue } =
      getAxisTransforms("log");

    it("should be linear for |x| < 1 and logarithmic for |x| >= 1", () => {
      expect(toEChartsAxisValue(0.1)).toBe(0.1);
      expect(toEChartsAxisValue(0.5)).toBe(0.5);
      expect(toEChartsAxisValue(0.9)).toBe(0.9);

      expect(toEChartsAxisValue(1)).toBeCloseTo(1, 5);
      expect(toEChartsAxisValue(10)).toBeCloseTo(2, 5);
      expect(toEChartsAxisValue(100)).toBeCloseTo(3, 5);
    });

    it.each([
      0, 1, -1, 10, -10, 100, -100, 0.5, -0.5, 0.01, -0.01, 0.001, -0.001,
    ])(
      "should have fromEChartsAxisValue as the inverse of toEChartsAxisValue for %d",
      (value) => {
        const encoded = toEChartsAxisValue(value) as number;
        const decoded = fromEChartsAxisValue(encoded);
        expect(decoded).toBeCloseTo(value, 5);
      },
    );
  });
});
