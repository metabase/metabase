import { roundFloat } from "./numbers";

describe("roundFloat", () => {
  it.each([
    // Rounding defaults to 2 digits, defined in DEFAULT_NUMBER_OPTIONS
    [30, undefined, 30],
    [1.2345, undefined, 1.23],
    [1.6789, undefined, 1.68],
    [1.2345, 0, 1],
    [1.6789, 0, 2],
    [1.2345, 3, 1.235],
    [1.6789, 3, 1.679],
  ])(
    "should round the floating-point number to the specified decimal places",
    (input, places, expected) => {
      expect(roundFloat(input, places)).toEqual(expected);
    },
  );
});
