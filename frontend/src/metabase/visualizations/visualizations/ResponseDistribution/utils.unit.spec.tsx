import {
  calculateWeightedScore,
  getColorCategoryLabel,
  getColorForWeight,
} from "metabase/visualizations/shared/utils/scoring";
import type { DatasetData } from "metabase-types/api";

import {
  isCNAOption,
  isResponseDistributionSensible,
  processData,
  sortOptions,
} from "./utils";

describe("ResponseDistribution utils", () => {
  describe("isCNAOption", () => {
    it("should return true for truthy CNA values", () => {
      expect(isCNAOption([false, true, "text"], 1)).toBe(true);
      expect(isCNAOption([false, 1, "text"], 1)).toBe(true);
      expect(isCNAOption([false, "true", "text"], 1)).toBe(true);
    });

    it("should return false for falsy CNA values", () => {
      expect(isCNAOption([false, false, "text"], 1)).toBe(false);
      expect(isCNAOption([false, 0, "text"], 1)).toBe(false);
      expect(isCNAOption([false, null, "text"], 1)).toBe(false);
    });

    it("should return false when CNA column index is null", () => {
      expect(isCNAOption([false, true, "text"], null)).toBe(false);
    });
  });

  describe("getColorForWeight", () => {
    it("should return correct CSS variable for CNA options", () => {
      const color = getColorForWeight(50, true);
      expect(color).toBe("var(--mb-color-scoring-cna)");
    });

    it("should return yellow CSS variable for weight <= 78.6", () => {
      expect(getColorForWeight(78.6, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
      expect(getColorForWeight(50, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
      expect(getColorForWeight(0, false)).toBe(
        "var(--mb-color-scoring-needs-improvement)",
      );
    });

    it("should return green CSS variable for weight between 78.6 and 92.9", () => {
      expect(getColorForWeight(78.7, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
      expect(getColorForWeight(85, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
      expect(getColorForWeight(92.8, false)).toBe(
        "var(--mb-color-scoring-satisfactory)",
      );
    });

    it("should return blue CSS variable for weight >= 92.9", () => {
      expect(getColorForWeight(92.9, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
      expect(getColorForWeight(100, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
      expect(getColorForWeight(150, false)).toBe(
        "var(--mb-color-scoring-exceptional)",
      );
    });
  });

  describe("getColorCategoryLabel", () => {
    it("should return correct labels for each weight category", () => {
      expect(getColorCategoryLabel(50, false)).toBe("Needs Improvement");
      expect(getColorCategoryLabel(85, false)).toBe("Satisfactory");
      expect(getColorCategoryLabel(95, false)).toBe("Exceptional");
      expect(getColorCategoryLabel(50, true)).toBe("Choose Not to Answer");
    });
  });

  describe("calculateScore", () => {
    it("should calculate weighted average excluding CNA", () => {
      const options = [
        {
          text: "A",
          weight: 100,
          count: 2,
          percentage: 20,
          isCNA: false,
          color: "#2196F3",
        },
        {
          text: "B",
          weight: 80,
          count: 3,
          percentage: 30,
          isCNA: false,
          color: "#00A080",
        },
        {
          text: "C",
          weight: 60,
          count: 5,
          percentage: 50,
          isCNA: false,
          color: "#FAC849",
        },
      ];

      // (100*2 + 80*3 + 60*5) / (2+3+5) = (200 + 240 + 300) / 10 = 740 / 10 = 74
      expect(calculateWeightedScore(options)).toBe(74);
    });

    it("should exclude CNA options from calculation", () => {
      const options = [
        {
          text: "A",
          weight: 100,
          count: 2,
          percentage: 20,
          isCNA: false,
          color: "#2196F3",
        },
        {
          text: "B",
          weight: 80,
          count: 3,
          percentage: 30,
          isCNA: false,
          color: "#00A080",
        },
        {
          text: "CNA",
          weight: 0,
          count: 5,
          percentage: 50,
          isCNA: true,
          color: "#969696",
        },
      ];

      // (100*2 + 80*3) / (2+3) = (200 + 240) / 5 = 440 / 5 = 88
      expect(calculateWeightedScore(options)).toBe(88);
    });

    it("should return 0 for empty options", () => {
      expect(calculateWeightedScore([])).toBe(0);
    });

    it("should return 0 when all options are CNA", () => {
      const options = [
        {
          text: "CNA",
          weight: 0,
          count: 10,
          percentage: 100,
          isCNA: true,
          color: "#969696",
        },
      ];

      expect(calculateWeightedScore(options)).toBe(0);
    });

    it("should return 0 when total count is 0", () => {
      const options = [
        {
          text: "A",
          weight: 100,
          count: 0,
          percentage: 0,
          isCNA: false,
          color: "#2196F3",
        },
      ];

      expect(calculateWeightedScore(options)).toBe(0);
    });
  });

  describe("sortOptions", () => {
    it("should sort by order field when useSortColumn is true", () => {
      const options = [
        {
          text: "C",
          weight: 60,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 3,
          color: "#FAC849",
        },
        {
          text: "A",
          weight: 100,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 1,
          color: "#2196F3",
        },
        {
          text: "B",
          weight: 80,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 2,
          color: "#00A080",
        },
      ];

      const sorted = sortOptions(options, true);

      expect(sorted[0].text).toBe("A");
      expect(sorted[1].text).toBe("B");
      expect(sorted[2].text).toBe("C");
    });

    it("should place CNA last regardless of order", () => {
      const options = [
        {
          text: "B",
          weight: 80,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 2,
          color: "#00A080",
        },
        {
          text: "CNA",
          weight: 0,
          count: 1,
          percentage: 10,
          isCNA: true,
          order: 1,
          color: "#969696",
        },
        {
          text: "A",
          weight: 100,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 3,
          color: "#2196F3",
        },
      ];

      const sorted = sortOptions(options, true);

      // CNA should be last, B should be first (order 2), A should be second (order 3)
      expect(sorted[0].text).toBe("B");
      expect(sorted[1].text).toBe("A");
      expect(sorted[2].text).toBe("CNA");
    });

    it("should only sort CNA to last when useSortColumn is false", () => {
      const options = [
        {
          text: "C",
          weight: 60,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 3,
          color: "#FAC849",
        },
        {
          text: "CNA",
          weight: 0,
          count: 1,
          percentage: 10,
          isCNA: true,
          order: 1,
          color: "#969696",
        },
        {
          text: "A",
          weight: 100,
          count: 1,
          percentage: 10,
          isCNA: false,
          order: 1,
          color: "#2196F3",
        },
      ];

      const sorted = sortOptions(options, false);

      // CNA should be last, but A and C maintain original relative order
      expect(sorted[2].text).toBe("CNA");
    });
  });

  describe("isResponseDistributionSensible", () => {
    it("should return true for valid data", () => {
      const data = {
        cols: [{ name: "text" } as any, { name: "count" } as any],
        rows: [["Option A", 10]],
      } as DatasetData;

      expect(isResponseDistributionSensible(data)).toBe(true);
    });

    it("should return false for empty rows", () => {
      const data = {
        cols: [{ name: "text" } as any, { name: "count" } as any],
        rows: [],
      } as unknown as DatasetData;

      expect(isResponseDistributionSensible(data)).toBe(false);
    });

    it("should return false for insufficient columns", () => {
      const data = {
        cols: [{ name: "text" } as any],
        rows: [["Option A"]],
      } as DatasetData;

      expect(isResponseDistributionSensible(data)).toBe(false);
    });
  });

  describe("processData", () => {
    it("should process data correctly with all columns", () => {
      const data = {
        cols: [
          { name: "option_text" },
          { name: "option_weight" },
          { name: "response_count" },
          { name: "total_responses" },
          { name: "is_cna" },
          { name: "option_order" },
        ],
        rows: [
          ["Option A", 100, 2, 10, false, 1],
          ["Option B", 80, 3, 10, false, 2],
          ["CNA", 0, 5, 10, true, 3],
        ],
      } as any as DatasetData;

      const settings = {
        "response_distribution.option_text_column": "option_text",
        "response_distribution.option_weight_column": "option_weight",
        "response_distribution.response_count_column": "response_count",
        "response_distribution.total_responses_column": "total_responses",
        "response_distribution.is_cna_column": "is_cna",
        "response_distribution.use_custom_order": true,
        "response_distribution.option_order_column": "option_order",
      };

      const result = processData(data, settings);

      expect(result.options).toHaveLength(3);
      expect(result.totalResponses).toBe(10);
      expect(result.overallScore).toBe(88); // (100*2 + 80*3) / 5

      // Check Option A
      expect(result.options[0].text).toBe("Option A");
      expect(result.options[0].weight).toBe(100);
      expect(result.options[0].count).toBe(2);
      expect(result.options[0].percentage).toBe(20);
      expect(result.options[0].isCNA).toBe(false);

      // Check CNA is last
      expect(result.options[2].text).toBe("CNA");
      expect(result.options[2].isCNA).toBe(true);
    });

    it("should handle missing CNA column", () => {
      const data = {
        cols: [
          { name: "option_text" },
          { name: "option_weight" },
          { name: "response_count" },
          { name: "total_responses" },
        ],
        rows: [
          ["Option A", 100, 2, 10],
          ["Option B", 80, 8, 10],
        ],
      } as any as DatasetData;

      const settings = {
        "response_distribution.option_text_column": "option_text",
        "response_distribution.option_weight_column": "option_weight",
        "response_distribution.response_count_column": "response_count",
        "response_distribution.total_responses_column": "total_responses",
        "response_distribution.use_custom_order": false,
      };

      const result = processData(data, settings);

      expect(result.options).toHaveLength(2);
      expect(result.options.every((opt) => !opt.isCNA)).toBe(true);
    });

    it("should calculate total responses from counts if total column missing", () => {
      const data = {
        cols: [
          { name: "option_text" },
          { name: "option_weight" },
          { name: "response_count" },
        ],
        rows: [
          ["Option A", 100, 3],
          ["Option B", 80, 7],
        ],
      } as any as DatasetData;

      const settings = {
        "response_distribution.option_text_column": "option_text",
        "response_distribution.option_weight_column": "option_weight",
        "response_distribution.response_count_column": "response_count",
        "response_distribution.use_custom_order": false,
      };

      const result = processData(data, settings);

      expect(result.totalResponses).toBe(10); // 3 + 7
    });
  });
});
