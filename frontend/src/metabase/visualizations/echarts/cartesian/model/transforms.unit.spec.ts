import { getAxisTransforms } from "./transforms";

describe("getAxisTransforms - log scale", () => {
  const { toEChartsAxisValue, fromEChartsAxisValue } = getAxisTransforms("log");

  it.each([
    [9, 1],
    [-9, -1],
    [99, 2],
    [-99, -2],
    [0.5, Math.log10(1.5)],
    [-0.5, -Math.log10(1.5)],
    [0.01, Math.log10(1.01)],
    [-0.01, -Math.log10(1.01)],
    [0, 0],
  ])("toEChartsAxisValue(%d) === %d", (input, expected) => {
    expect(toEChartsAxisValue(input)).toBeCloseTo(expected, 5);
  });

  it.each([
    [1, 9],
    [-1, -9],
    [2, 99],
    [-2, -99],
    [Math.log10(1.5), 0.5],
    [-Math.log10(1.5), -0.5],
    [0, 0],
  ])("fromEChartsAxisValue(%d) === %d", (input, expected) => {
    expect(fromEChartsAxisValue(input)).toBeCloseTo(expected, 5);
  });

  it.each([0, 9, -9, 99, -99, 0.5, -0.5, 0.01, -0.01, 0.001, -0.001])(
    "fromEChartsAxisValue(toEChartsAxisValue(%d)) === %d",
    (value) => {
      const encoded = toEChartsAxisValue(value) as number;
      const decoded = fromEChartsAxisValue(encoded);
      expect(decoded).toBeCloseTo(value, 5);
    },
  );
});
