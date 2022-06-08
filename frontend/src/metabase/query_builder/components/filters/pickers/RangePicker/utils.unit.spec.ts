import { getStep, roundToStep } from "./utils";

describe("rangePicker utils", () => {
  describe("getStep()", () => {
    it("should return the correct step for low values", () => {
      const [min, max] = [0, 100];
      expect(getStep(min, max)).toBe(1);
    });

    it("should return the correct step for medium values", () => {
      const [min, max] = [0, 50000];
      expect(getStep(min, max)).toBe(250);
    });

    it("should return the correct step for high values", () => {
      const [min, max] = [-999999999, 9999999];
      expect(getStep(min, max)).toBe(250000);
    });

    it("should return the correct step for negative numbers", () => {
      const [min, max] = [-1000, 0];
      expect(getStep(min, max)).toBe(25);
    });

    it("should get the correct step for decimals", () => {
      const [min, max] = [-1000, 10000000.78];
      expect(getStep(min, max)).toBe(0.25);
    });
  });

  describe("roundToStep()", () => {
    it("should round whole numbers to the nearest step", () => {
      const rounded = roundToStep(33, 25);

      expect(rounded).toBe(25);
    });

    it("should round decimal numbers to the nearest step", () => {
      const rounded = roundToStep(33.7, 0.25);

      expect(rounded).toBe(33.75);
    });

    it("should round negative numbers to the nearest step", () => {
      const rounded = roundToStep(-840, 250);

      expect(rounded).toBe(-750);
    });
  });
});
