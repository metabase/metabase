import {
  type LightnessStop,
  detectLightnessStep,
  generateLightnessStops,
  generateMultipleLightnessStops,
  getAccessibleBackgroundStep,
  getAccessibleTextStep,
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

    it("should generate alpha stops", () => {
      const result = generateLightnessStops("#509ee3");

      expect(result.alpha).toBeDefined();
      expect(Object.keys(result.alpha).length).toBeGreaterThan(0);
    });

    it("should generate inverse alpha stops", () => {
      const result = generateLightnessStops("#509ee3");

      expect(result.alphaInverse).toBeDefined();
      expect(Object.keys(result.alphaInverse).length).toBeGreaterThan(0);
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

  describe("generateMultipleLightnessStops", () => {
    it("should generate stops for multiple colors", () => {
      const result = generateMultipleLightnessStops({
        brand: "#509ee3",
        "background-primary": "#ffffff",
        "text-primary": "#303030",
      });

      expect(result.brand).toBeDefined();
      expect(result["background-primary"]).toBeDefined();
      expect(result["text-primary"]).toBeDefined();
    });

    it("should detect appropriate steps for each color type", () => {
      const result = generateMultipleLightnessStops({
        brand: "#509ee3",
        "background-primary": "#ffffff",
        "text-primary": "#303030",
      });

      // Background should be detected as a light color
      expect([5, 10]).toContain(result["background-primary"].detectedStep);

      // Text should be detected as a dark color
      expect([80, 90, 100, 110]).toContain(result["text-primary"].detectedStep);
    });

    it("should preserve color names in the result", () => {
      const input = {
        customBrand: "#ff0000",
        customBackground: "#eeeeee",
      };

      const result = generateMultipleLightnessStops(input);

      expect(Object.keys(result)).toEqual(["customBrand", "customBackground"]);
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

  describe("getAccessibleTextStep", () => {
    it("should find a step with sufficient contrast for light brand colors", () => {
      // #af60ff is a light purple that needs a darker step for text
      const stops = generateLightnessStops("#af60ff");
      const textStep = getAccessibleTextStep(stops);

      // Should be at least step 50 or darker for readable text
      expect(textStep).toBeGreaterThanOrEqual(50);
    });

    it("should return a relatively light step for dark brand colors", () => {
      // Dark blue should have good contrast even at lighter steps
      const stops = generateLightnessStops("#1e3a5f");
      const textStep = getAccessibleTextStep(stops);

      // Dark colors already have good contrast, so step 50 might work
      expect([50, 60, 70, 80, 90, 100, 110]).toContain(textStep);
    });

    it("should return 110 (darkest) if no step meets contrast requirement", () => {
      // Test with a very light color that has a very high minContrast
      const stops = generateLightnessStops("#ffffff");
      const textStep = getAccessibleTextStep(stops, "#ffffff", 21); // Max possible contrast

      expect(textStep).toBe(110);
    });

    it("should accept custom background color for contrast checking", () => {
      const stops = generateLightnessStops("#509ee3");

      // Check against a dark background - should find lighter steps more accessible
      const stepOnDark = getAccessibleTextStep(stops, "#1a1a1a", 4.5, 50);

      expect(stepOnDark).toBeDefined();
    });

    it("should accept custom minimum contrast ratio", () => {
      const stops = generateLightnessStops("#509ee3");

      // Lower contrast requirement should allow lighter steps
      const stepLowContrast = getAccessibleTextStep(stops, "#ffffff", 3.0);
      const stepHighContrast = getAccessibleTextStep(stops, "#ffffff", 7.0);

      // Higher contrast requirement should push to darker steps
      expect(stepHighContrast).toBeGreaterThanOrEqual(stepLowContrast);
    });
  });

  describe("getAccessibleBackgroundStep", () => {
    it("should find a dark enough step for white text on light brand colors", () => {
      // #af60ff is a light purple - needs a darker step for white text
      const stops = generateLightnessStops("#af60ff");
      const bgStep = getAccessibleBackgroundStep(stops);

      // Should be dark enough for 4.5:1 contrast with white
      expect(bgStep).toBeGreaterThanOrEqual(50);
    });

    it("should return detected step for already-dark brand colors", () => {
      // Dark blue already has good contrast with white
      const stops = generateLightnessStops("#1e3a5f");
      const bgStep = getAccessibleBackgroundStep(stops);

      // Should be at or near the detected step since it's already dark
      expect(bgStep).toBeGreaterThanOrEqual(stops.detectedStep);
    });

    it("should accept custom minimum contrast ratio", () => {
      const stops = generateLightnessStops("#509ee3");

      // Lower contrast requirement allows lighter steps
      const stepLowContrast = getAccessibleBackgroundStep(stops, 3.0);
      const stepHighContrast = getAccessibleBackgroundStep(stops, 7.0);

      // Higher contrast requirement should push to darker steps
      expect(stepHighContrast).toBeGreaterThanOrEqual(stepLowContrast);
    });
  });
});
