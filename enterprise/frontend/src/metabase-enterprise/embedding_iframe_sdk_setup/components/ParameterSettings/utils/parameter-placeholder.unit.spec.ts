import type { Parameter } from "metabase-types/api";

import { getParameterPlaceholder } from "./parameter-placeholder";

const createParameter = (overrides: Partial<Parameter> = {}): Parameter => ({
  id: "test-id",
  name: "Test Parameter",
  type: "string/=",
  slug: "test_parameter",
  ...overrides,
});

describe("getParameterPlaceholder", () => {
  describe("when parameter contains an array of defaults", () => {
    it("returns comma-separated values", () => {
      const parameter = createParameter({
        default: ["apple", "banana", "cherry"],
      });

      expect(getParameterPlaceholder(parameter)).toBe("apple, banana, cherry");
    });

    it("returns empty string for empty array", () => {
      const parameter = createParameter({ default: [] });
      expect(getParameterPlaceholder(parameter)).toBe("");
    });

    it("handles array with single value", () => {
      const parameter = createParameter({ default: ["single"] });
      expect(getParameterPlaceholder(parameter)).toBe("single");
    });

    it("handles array with mixed types", () => {
      const parameter = createParameter({ default: ["text", 123, true] });
      expect(getParameterPlaceholder(parameter)).toBe("text, 123, true");
    });
  });

  describe("when parameter has a non-array default", () => {
    it("returns the default value as string", () => {
      const stringDefault = createParameter({
        default: "default value",
      });

      expect(getParameterPlaceholder(stringDefault)).toBe("default value");

      const numberDefault = createParameter({
        default: 42,
      });

      expect(getParameterPlaceholder(numberDefault)).toBe("42");

      const booleanDefault = createParameter({
        default: true,
      });

      expect(getParameterPlaceholder(booleanDefault)).toBe("true");
    });
  });

  describe("when parameter has no default", () => {
    it("returns type-specific placeholder for string parameters", () => {
      const stringParam = createParameter({
        type: "string/=",
        default: null,
      });

      expect(getParameterPlaceholder(stringParam)).toBe("sample text");

      const stringContainsParam = createParameter({
        type: "string/contains",
        default: undefined,
      });

      expect(getParameterPlaceholder(stringContainsParam)).toBe("sample text");
    });

    it("returns type-specific placeholder for number parameters", () => {
      const numberParam = createParameter({
        type: "number/=",
        default: null,
      });

      expect(getParameterPlaceholder(numberParam)).toBe("1");

      const numberBetweenParam = createParameter({
        type: "number/between",
        default: undefined,
      });

      expect(getParameterPlaceholder(numberBetweenParam)).toBe("50 100");
    });

    it("returns type-specific placeholder for date parameters", () => {
      const dateSingleParam = createParameter({
        type: "date/single",
        default: null,
      });

      expect(getParameterPlaceholder(dateSingleParam)).toBe("2024-01-09");

      const dateRangeParam = createParameter({
        type: "date/range",
        default: undefined,
      });

      expect(getParameterPlaceholder(dateRangeParam)).toBe(
        "2023-01-09~2024-01-09",
      );

      const dateRelativeParam = createParameter({
        type: "date/relative",
        default: null,
      });

      expect(getParameterPlaceholder(dateRelativeParam)).toBe("past1years");

      const dateMonthYearParam = createParameter({
        type: "date/month-year",
        default: null,
      });

      expect(getParameterPlaceholder(dateMonthYearParam)).toBe("2024-01");

      const dateQuarterYearParam = createParameter({
        type: "date/quarter-year",
        default: null,
      });

      expect(getParameterPlaceholder(dateQuarterYearParam)).toBe("Q1-2024");

      const dateAllOptionsParam = createParameter({
        type: "date/all-options",
        default: null,
      });

      expect(getParameterPlaceholder(dateAllOptionsParam)).toBe("2024-01-09");

      const dateGenericParam = createParameter({
        type: "date",
        default: null,
      });

      expect(getParameterPlaceholder(dateGenericParam)).toBe("2024-01-09");
    });

    it("returns type-specific placeholder for boolean parameters", () => {
      const booleanParam = createParameter({
        type: "boolean/=",
        default: null,
      });

      expect(getParameterPlaceholder(booleanParam)).toBe("true");
    });

    it("returns type-specific placeholder for temporal-unit parameters", () => {
      const temporalUnitParam = createParameter({
        type: "temporal-unit",
        default: null,
      });

      expect(getParameterPlaceholder(temporalUnitParam)).toBe(
        "minute, hour, day, month, year",
      );
    });

    it("returns type-specific placeholder for category and id parameters", () => {
      const categoryParam = createParameter({
        type: "category",
        default: null,
      });

      expect(getParameterPlaceholder(categoryParam)).toBe("sample category");

      const idParam = createParameter({
        type: "id",
        default: undefined,
      });

      expect(getParameterPlaceholder(idParam)).toBe("1");
    });

    it("returns empty placeholder for unknown parameter types", () => {
      const unknownParam = createParameter({
        type: "unknown/unknown",
        default: null,
      });

      expect(getParameterPlaceholder(unknownParam)).toBe("");
    });
  });
});
