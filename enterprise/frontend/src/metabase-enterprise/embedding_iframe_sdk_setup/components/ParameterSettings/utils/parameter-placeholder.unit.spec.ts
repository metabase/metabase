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

  describe("when parameter has missing default", () => {
    it("returns lowercased parameter name for null or undefined default", () => {
      const nullDefault = createParameter({
        name: "Category Filter",
        default: null,
      });

      expect(getParameterPlaceholder(nullDefault)).toBe("category filter");

      const undefinedDefault = createParameter({
        name: "Date Range",
        default: undefined,
      });

      expect(getParameterPlaceholder(undefinedDefault)).toBe("date range");
    });
  });
});
