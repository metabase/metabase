import {
  SCORE_THRESHOLDS,
  SCORING_COLOR_VARS,
  type ScoredItem,
  calculateWeightedScore,
  formatScore,
  getColorCategoryLabel,
  getColorForWeight,
  getScoreCategory,
} from "./scoring";

describe("scoring utilities", () => {
  describe("SCORE_THRESHOLDS", () => {
    it("should have correct threshold values", () => {
      expect(SCORE_THRESHOLDS.NEEDS_IMPROVEMENT_MAX).toBe(78.6);
      expect(SCORE_THRESHOLDS.SATISFACTORY_MAX).toBe(92.9);
    });
  });

  describe("getColorForWeight", () => {
    it("should return CNA color for CNA responses", () => {
      expect(getColorForWeight(100, true)).toBe("var(--mb-color-scoring-cna)");
      expect(getColorForWeight(0, true)).toBe("var(--mb-color-scoring-cna)");
    });

    it("should return needs improvement color for low scores", () => {
      expect(getColorForWeight(0, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
      expect(getColorForWeight(50, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
      expect(getColorForWeight(78.6, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
    });

    it("should return satisfactory color for medium scores", () => {
      expect(getColorForWeight(78.7, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
      expect(getColorForWeight(85, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
      expect(getColorForWeight(92, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
    });

    it("should return exceptional color for high scores", () => {
      expect(getColorForWeight(92.9, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
      expect(getColorForWeight(95, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
      expect(getColorForWeight(100, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
    });
  });

  describe("getScoreCategory", () => {
    it("should return cna for CNA responses", () => {
      expect(getScoreCategory(100, true)).toBe("cna");
    });

    it("should return needs_improvement for low scores", () => {
      expect(getScoreCategory(50, false)).toBe("needs_improvement");
      expect(getScoreCategory(78.6, false)).toBe("needs_improvement");
    });

    it("should return satisfactory for medium scores", () => {
      expect(getScoreCategory(78.7, false)).toBe("satisfactory");
      expect(getScoreCategory(85, false)).toBe("satisfactory");
    });

    it("should return exceptional for high scores", () => {
      expect(getScoreCategory(92.9, false)).toBe("exceptional");
      expect(getScoreCategory(100, false)).toBe("exceptional");
    });
  });

  describe("getColorCategoryLabel", () => {
    it("should return correct label for CNA", () => {
      expect(getColorCategoryLabel(100, true)).toBe("Choose Not to Answer");
    });

    it("should return correct label for needs improvement", () => {
      expect(getColorCategoryLabel(50, false)).toBe("Needs Improvement");
    });

    it("should return correct label for satisfactory", () => {
      expect(getColorCategoryLabel(85, false)).toBe("Satisfactory");
    });

    it("should return correct label for exceptional", () => {
      expect(getColorCategoryLabel(95, false)).toBe("Exceptional");
    });
  });

  describe("calculateWeightedScore", () => {
    it("should calculate weighted average correctly", () => {
      const items: ScoredItem[] = [
        { weight: 100, count: 2, isCNA: false },
        { weight: 80, count: 3, isCNA: false },
      ];
      // (100*2 + 80*3) / 5 = 440 / 5 = 88
      expect(calculateWeightedScore(items)).toBe(88);
    });

    it("should exclude CNA responses from calculation", () => {
      const items: ScoredItem[] = [
        { weight: 100, count: 2, isCNA: false },
        { weight: 80, count: 3, isCNA: false },
        { weight: 0, count: 5, isCNA: true },
      ];
      // (100*2 + 80*3) / 5 = 440 / 5 = 88
      expect(calculateWeightedScore(items)).toBe(88);
    });

    it("should return 0 when all responses are CNA", () => {
      const items: ScoredItem[] = [{ weight: 0, count: 5, isCNA: true }];
      expect(calculateWeightedScore(items)).toBe(0);
    });

    it("should return 0 when no items", () => {
      expect(calculateWeightedScore([])).toBe(0);
    });

    it("should handle edge case with zero total count", () => {
      const items: ScoredItem[] = [
        { weight: 100, count: 0, isCNA: false },
        { weight: 80, count: 0, isCNA: false },
      ];
      expect(calculateWeightedScore(items)).toBe(0);
    });

    it("should handle edge case with Infinity", () => {
      const items: ScoredItem[] = [
        { weight: Infinity, count: 1, isCNA: false },
      ];
      expect(calculateWeightedScore(items)).toBe(0);
    });

    it("should handle edge case with NaN", () => {
      const items: ScoredItem[] = [{ weight: NaN, count: 1, isCNA: false }];
      expect(calculateWeightedScore(items)).toBe(0);
    });
  });

  describe("formatScore", () => {
    it("should format valid scores to 2 decimal places", () => {
      expect(formatScore(88.123456)).toBe("88.12");
      expect(formatScore(100)).toBe("100.00");
      expect(formatScore(0)).toBe("0.00");
    });

    it("should handle edge cases", () => {
      expect(formatScore(NaN)).toBe("0.00");
      expect(formatScore(Infinity)).toBe("0.00");
      expect(formatScore(-Infinity)).toBe("0.00");
    });
  });

  describe("SCORING_COLOR_VARS", () => {
    it("should have all CSS variable references", () => {
      expect(SCORING_COLOR_VARS.needsImprovement).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
      expect(SCORING_COLOR_VARS.satisfactory).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
      expect(SCORING_COLOR_VARS.exceptional).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
      expect(SCORING_COLOR_VARS.cna).toBe("var(--mb-color-scoring-cna)");
    });
  });
});
