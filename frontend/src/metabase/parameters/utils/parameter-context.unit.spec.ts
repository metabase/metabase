import type { DashboardCard, Parameter } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import {
  createMockActionDashboardCard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
} from "metabase-types/api/mocks/dashboard";

import {
  getParameterUrlSlug,
  getParametersInSameContext,
  isDashboardLevelParameter,
  isParameterInDashcard,
} from "./parameter-context";

describe("parameter-context utils", () => {
  describe("isParameterInDashcard", () => {
    it("should return true when parameter is in dashcard's inline_parameters", () => {
      const dashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: ["param1", "param2"],
      });

      expect(isParameterInDashcard("param1", dashcard)).toBe(true);
      expect(isParameterInDashcard("param2", dashcard)).toBe(true);
    });

    it("should return false when parameter is not in dashcard's inline_parameters", () => {
      const dashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: ["param1", "param2"],
      });

      expect(isParameterInDashcard("param3", dashcard)).toBe(false);
    });

    it("should return false when dashcard has no inline_parameters", () => {
      const dashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: [],
      });

      expect(isParameterInDashcard("param1", dashcard)).toBe(false);
    });

    it("should return false when dashcard has null inline_parameters", () => {
      const dashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: null,
      });

      expect(isParameterInDashcard("param1", dashcard)).toBe(false);
    });

    it("should work with action dashcards", () => {
      const dashcard = createMockActionDashboardCard({
        id: 1,
      });

      expect(isParameterInDashcard("param1", dashcard)).toBe(false);
    });

    it("should work with heading dashcards", () => {
      const dashcard = createMockHeadingDashboardCard({
        id: 1,
        inline_parameters: ["param1"],
      });

      expect(isParameterInDashcard("param1", dashcard)).toBe(true);
    });
  });

  describe("isDashboardLevelParameter", () => {
    it("should return true when parameter is not in any dashcard", () => {
      const dashcards: DashboardCard[] = [
        createMockDashboardCard({
          id: 1,
          inline_parameters: ["param1"],
        }),
        createMockDashboardCard({
          id: 2,
          inline_parameters: ["param2"],
        }),
      ];

      expect(isDashboardLevelParameter("param3", dashcards)).toBe(true);
    });

    it("should return false when parameter is in a dashcard", () => {
      const dashcards: DashboardCard[] = [
        createMockDashboardCard({
          id: 1,
          inline_parameters: ["param1"],
        }),
        createMockDashboardCard({
          id: 2,
          inline_parameters: ["param2"],
        }),
      ];

      expect(isDashboardLevelParameter("param1", dashcards)).toBe(false);
      expect(isDashboardLevelParameter("param2", dashcards)).toBe(false);
    });

    it("should return true when dashcards array is empty", () => {
      expect(isDashboardLevelParameter("param1", [])).toBe(true);
    });

    it("should handle dashcards with null inline_parameters", () => {
      const dashcards: DashboardCard[] = [
        createMockDashboardCard({
          id: 1,
          inline_parameters: null,
        }),
        createMockDashboardCard({
          id: 2,
          inline_parameters: ["param2"],
        }),
      ];

      expect(isDashboardLevelParameter("param1", dashcards)).toBe(true);
      expect(isDashboardLevelParameter("param2", dashcards)).toBe(false);
    });
  });

  describe("getParametersInSameContext", () => {
    const param1 = createMockParameter({ id: "param1", name: "Parameter 1" });
    const param2 = createMockParameter({ id: "param2", name: "Parameter 2" });
    const param3 = createMockParameter({ id: "param3", name: "Parameter 3" });
    const param4 = createMockParameter({ id: "param4", name: "Parameter 4" });
    const parameters: Parameter[] = [param1, param2, param3, param4];

    it("should return parameters in the same dashcard when targetDashcard is provided", () => {
      const targetDashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: ["param1", "param3"],
      });
      const otherDashcard = createMockDashboardCard({
        id: 2,
        inline_parameters: ["param2"],
      });
      const dashcards = [targetDashcard, otherDashcard];

      const result = getParametersInSameContext(
        parameters,
        targetDashcard,
        dashcards,
      );

      expect(result).toEqual([param1, param3]);
    });

    it("should return dashboard-level parameters when targetDashcard is null", () => {
      const dashcard1 = createMockDashboardCard({
        id: 1,
        inline_parameters: ["param1"],
      });
      const dashcard2 = createMockDashboardCard({
        id: 2,
        inline_parameters: ["param2"],
      });
      const dashcards = [dashcard1, dashcard2];

      const result = getParametersInSameContext(parameters, null, dashcards);

      expect(result).toEqual([param3, param4]);
    });

    it("should return dashboard-level parameters when targetDashcard is undefined", () => {
      const dashcard1 = createMockDashboardCard({
        id: 1,
        inline_parameters: ["param1", "param2"],
      });
      const dashcards = [dashcard1];

      const result = getParametersInSameContext(
        parameters,
        undefined,
        dashcards,
      );

      expect(result).toEqual([param3, param4]);
    });

    it("should return empty array when no parameters match the context", () => {
      const targetDashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: [],
      });
      const dashcards = [targetDashcard];

      const result = getParametersInSameContext(
        parameters,
        targetDashcard,
        dashcards,
      );

      expect(result).toEqual([]);
    });

    it("should return all parameters when no dashcards have inline parameters", () => {
      const dashcard = createMockDashboardCard({
        id: 1,
        inline_parameters: null,
      });
      const dashcards = [dashcard];

      const result = getParametersInSameContext(parameters, null, dashcards);

      expect(result).toEqual(parameters);
    });
  });

  describe("getParameterUrlSlug", () => {
    const parameter = createMockParameter({
      id: "param1",
      slug: "text-filter",
    });

    it("should return parameter slug when dashcard is null", () => {
      expect(getParameterUrlSlug(parameter, null)).toBe("text-filter");
    });

    it("should return parameter slug when dashcard is undefined", () => {
      expect(getParameterUrlSlug(parameter, undefined)).toBe("text-filter");
    });

    it("should append dashcard id when dashcard is provided", () => {
      const dashcard = createMockDashboardCard({ id: 123 });

      expect(getParameterUrlSlug(parameter, dashcard)).toBe("text-filter-123");
    });

    it("should handle special characters in slug", () => {
      const paramWithSpecialSlug = createMockParameter({
        id: "param1",
        slug: "date_range",
      });
      const dashcard = createMockDashboardCard({ id: 456 });

      expect(getParameterUrlSlug(paramWithSpecialSlug, dashcard)).toBe(
        "date_range-456",
      );
    });

    it("should work with heading dashcards", () => {
      const headingDashcard = createMockHeadingDashboardCard({ id: 789 });

      expect(getParameterUrlSlug(parameter, headingDashcard)).toBe(
        "text-filter-789",
      );
    });
  });
});
