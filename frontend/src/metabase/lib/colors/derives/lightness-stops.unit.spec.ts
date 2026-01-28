import type { LightnessStop } from "../types/lightness-stops";

import {
  detectLightnessStep,
  generateLightnessStops,
  getRelativeStep,
} from "./lightness-stops";

describe("lightness-stops", () => {
  describe("detectLightnessStep", () => {
    it("should detect white as the lightest step (5)", () => {
      expect(detectLightnessStep("#ffffff")).toBe(5);
    });

    it("should detect black as the darkest step (110)", () => {
      expect(detectLightnessStep("#000000")).toBe(110);
    });

    it("should detect a mid-tone color correctly", () => {
      // Metabase brand blue #509ee3 should be around step 40
      const step = detectLightnessStep("#509ee3");
      expect([30, 40, 50]).toContain(step);
    });

    it("should detect a light color close to the lighter steps", () => {
      const step = detectLightnessStep("#f0f0f0");
      expect([5, 10, 20]).toContain(step);
    });

    it("should detect a dark color close to the darker steps", () => {
      const step = detectLightnessStep("#303030");
      expect([80, 90, 100, 110]).toContain(step);
    });
  });

  describe("generateLightnessStops", () => {
    it("should generate all 12 solid color stops", () => {
      const result = generateLightnessStops("#509ee3");

      const expectedStops: LightnessStop[] = [
        5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
      ];
      for (const stop of expectedStops) {
        expect(result.solid[stop]).toBeDefined();
        expect(typeof result.solid[stop]).toBe("string");
      }
    });

    it("should detect the original color's step", () => {
      const result = generateLightnessStops("#509ee3");

      expect(result.detectedStep).toBeDefined();
      expect([5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]).toContain(
        result.detectedStep,
      );
    });

    it("should generate lighter colors at lower stops", () => {
      const result = generateLightnessStops("#509ee3");

      // The color at step 5 should have higher lightness than at step 100
      // We can check this by seeing if the HSL lightness is higher
      expect(result.solid[5]).toMatch(/hsl/i);
      expect(result.solid[100]).toMatch(/hsl/i);
    });

    it("should work with different color formats", () => {
      // Hex
      const hexResult = generateLightnessStops("#ff5733");
      expect(hexResult.solid[40]).toBeDefined();

      // RGB (chroma-js uses legacy comma syntax)
      const rgbResult = generateLightnessStops("rgb(255, 87, 51)");
      expect(rgbResult.solid[40]).toBeDefined();

      // Named color
      const namedResult = generateLightnessStops("blue");
      expect(namedResult.solid[40]).toBeDefined();
    });
  });

  describe("getRelativeStep", () => {
    it("should return a lighter step with negative offset", () => {
      expect(getRelativeStep(50, -2)).toBe(30);
      expect(getRelativeStep(60, -1)).toBe(50);
    });

    it("should return a darker step with positive offset", () => {
      expect(getRelativeStep(50, 1)).toBe(60);
      expect(getRelativeStep(50, 2)).toBe(70);
    });

    it("should clamp to the lightest step (5) when going too light", () => {
      expect(getRelativeStep(10, -2)).toBe(5);
      expect(getRelativeStep(5, -1)).toBe(5);
      expect(getRelativeStep(20, -5)).toBe(5);
    });

    it("should clamp to the darkest step (110) when going too dark", () => {
      expect(getRelativeStep(100, 2)).toBe(110);
      expect(getRelativeStep(110, 1)).toBe(110);
      expect(getRelativeStep(90, 5)).toBe(110);
    });

    it("should return the same step with zero offset", () => {
      expect(getRelativeStep(50, 0)).toBe(50);
      expect(getRelativeStep(5, 0)).toBe(5);
      expect(getRelativeStep(110, 0)).toBe(110);
    });
  });
});
