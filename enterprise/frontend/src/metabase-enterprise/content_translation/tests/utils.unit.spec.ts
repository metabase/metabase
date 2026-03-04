import type { HoveredObject } from "metabase/visualizations/types";
import type { DatasetColumn, DictionaryArray } from "metabase-types/api";
import { createMockColumn, createMockSeries } from "metabase-types/api/mocks";

import { leaveUntranslated } from "../use-translate-content";
import {
  translateCardNames,
  translateContentString,
  translateDisplayNames,
  translateFieldValuesInHoveredObject,
  translateFieldValuesInSeries,
} from "../utils";

describe("content translation utils", () => {
  describe("translateContentString", () => {
    const mockDictionary: DictionaryArray = [
      { locale: "es", msgid: "Hello", msgstr: "Hola" },
      { locale: "es", msgid: "World", msgstr: "Mundo" },
      { locale: "fr", msgid: "Hello", msgstr: "Bonjour" },
      { locale: "es", msgid: "  ", msgstr: "  " }, // whitespace only
      { locale: "es", msgid: "Empty Translation", msgstr: "" },
      { locale: "es", msgid: "Whitespace Translation", msgstr: "   " },
    ];

    it("should return msgid when locale is undefined", () => {
      expect(translateContentString(mockDictionary, undefined, "Hello")).toBe(
        "Hello",
      );
    });

    it("should return msgid when locale is empty string", () => {
      expect(translateContentString(mockDictionary, "", "Hello")).toBe("Hello");
    });

    it("should return msgid when dictionary is undefined", () => {
      expect(translateContentString(undefined, "es", "Hello")).toBe("Hello");
    });

    it("should return msgid when msgid is null", () => {
      expect(translateContentString(mockDictionary, "es", null)).toBe(null);
    });

    it("should return msgid when msgid is undefined", () => {
      expect(translateContentString(mockDictionary, "es", undefined)).toBe(
        undefined,
      );
    });

    it("should return msgid when msgid is not a string", () => {
      expect(translateContentString(mockDictionary, "es", 123 as any)).toBe(
        123,
      );
      expect(translateContentString(mockDictionary, "es", {} as any)).toEqual(
        {},
      );
      expect(translateContentString(mockDictionary, "es", [] as any)).toEqual(
        [],
      );
    });

    it("should return msgid when msgid is empty string", () => {
      expect(translateContentString(mockDictionary, "es", "")).toBe("");
    });

    it("should return msgid when msgid is whitespace only", () => {
      expect(translateContentString(mockDictionary, "es", "   ")).toBe("   ");
    });

    it("should return translated string when translation exists", () => {
      expect(translateContentString(mockDictionary, "es", "Hello")).toBe(
        "Hola",
      );
      expect(translateContentString(mockDictionary, "es", "World")).toBe(
        "Mundo",
      );
      expect(translateContentString(mockDictionary, "fr", "Hello")).toBe(
        "Bonjour",
      );
    });

    it("should return msgid when translation doesn't exist for locale", () => {
      expect(translateContentString(mockDictionary, "de", "Hello")).toBe(
        "Hello",
      );
    });

    it("should return msgid when translation doesn't exist for msgid", () => {
      expect(translateContentString(mockDictionary, "es", "Goodbye")).toBe(
        "Goodbye",
      );
    });

    it("should return msgid when translation is empty", () => {
      expect(
        translateContentString(mockDictionary, "es", "Empty Translation"),
      ).toBe("Empty Translation");
    });

    it("should return msgid when translation is whitespace only", () => {
      expect(
        translateContentString(mockDictionary, "es", "Whitespace Translation"),
      ).toBe("Whitespace Translation");
    });

    it("should be case insensitive for msgid (metabase#61795)", () => {
      expect(translateContentString(mockDictionary, "es", "hello")).toBe(
        "Hola",
      );
      expect(translateContentString(mockDictionary, "es", "WORLD")).toBe(
        "Mundo",
      );
    });
  });

  describe("translateDisplayNames", () => {
    const tc = (str: string | null | unknown) => `mock translation of ${str}`;
    const mockTc = jest.fn();

    beforeEach(() => {
      mockTc.mockClear();
      mockTc.mockImplementation(tc);
    });

    it("should translate display_name fields in simple objects", () => {
      const input = { display_name: "Test Name", other_field: "unchanged" };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(result).toEqual({
        display_name: "mock translation of Test Name",
        other_field: "unchanged",
      });
      expect(mockTc).toHaveBeenCalledWith("Test Name");
    });

    it("should translate custom field names when specified", () => {
      const input = { title: "Test Title", name: "Test Name" };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
        fieldsToTranslate: ["title", "name"],
      });

      expect(result).toEqual({
        title: "mock translation of Test Title",
        name: "mock translation of Test Name",
      });
      expect(mockTc).toHaveBeenCalledWith("Test Title");
      expect(mockTc).toHaveBeenCalledWith("Test Name");
    });

    it("should handle arrays of objects", () => {
      const input = [
        { display_name: "First", id: 1 },
        { display_name: "Second", id: 2 },
      ];
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(result).toEqual([
        { display_name: "mock translation of First", id: 1 },
        { display_name: "mock translation of Second", id: 2 },
      ]);
      expect(mockTc).toHaveBeenCalledWith("First");
      expect(mockTc).toHaveBeenCalledWith("Second");
    });

    it("should handle nested objects", () => {
      const input = {
        display_name: "Parent",
        child: {
          display_name: "Child",
          value: 42,
        },
      };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(result).toEqual({
        display_name: "mock translation of Parent",
        child: {
          display_name: "mock translation of Child",
          value: 42,
        },
      });
      expect(mockTc).toHaveBeenCalledWith("Parent");
      expect(mockTc).toHaveBeenCalledWith("Child");
    });

    it("should handle deeply nested structures with arrays and objects", () => {
      const input = {
        display_name: "Root",
        items: [
          {
            display_name: "Item 1",
            metadata: {
              display_name: "Meta 1",
            },
          },
          {
            display_name: "Item 2",
            tags: ["tag1", "tag2"],
          },
        ],
      };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(result).toEqual({
        display_name: "mock translation of Root",
        items: [
          {
            display_name: "mock translation of Item 1",
            metadata: {
              display_name: "mock translation of Meta 1",
            },
          },
          {
            display_name: "mock translation of Item 2",
            tags: ["tag1", "tag2"],
          },
        ],
      });
      expect(mockTc).toHaveBeenCalledWith("Root");
      expect(mockTc).toHaveBeenCalledWith("Item 1");
      expect(mockTc).toHaveBeenCalledWith("Meta 1");
      expect(mockTc).toHaveBeenCalledWith("Item 2");
    });

    it("should not translate non-string values in target fields", () => {
      const input = {
        display_name: 123,
        other_display_name: null,
        another_display_name: undefined,
      };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(result).toEqual({
        display_name: 123,
        other_display_name: null,
        another_display_name: undefined,
      });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should handle primitive values", () => {
      expect(
        translateDisplayNames({ obj: "string", tc: mockTc, locale: "en" }),
      ).toBe("string");
      expect(
        translateDisplayNames({ obj: 123, tc: mockTc, locale: "en" }),
      ).toBe(123);
      expect(
        translateDisplayNames({ obj: true, tc: mockTc, locale: "en" }),
      ).toBe(true);
      expect(
        translateDisplayNames({ obj: null, tc: mockTc, locale: "en" }),
      ).toBe(null);
      expect(
        translateDisplayNames({ obj: undefined, tc: mockTc, locale: "en" }),
      ).toBe(undefined);
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should create a deep copy and not mutate the original object", () => {
      const input = {
        display_name: "Original",
        nested: { display_name: "Nested" },
      };
      const result = translateDisplayNames({
        obj: input,
        tc: mockTc,
        locale: "en",
      });

      expect(input.display_name).toBe("Original");
      expect(input.nested.display_name).toBe("Nested");
      expect(result.display_name).toBe("mock translation of Original");
      expect(result.nested.display_name).toBe("mock translation of Nested");
      expect(result).not.toBe(input);
      expect(result.nested).not.toBe(input.nested);
    });

    it("should handle empty arrays and objects", () => {
      expect(
        translateDisplayNames({ obj: [], tc: mockTc, locale: "en" }),
      ).toEqual([]);
      expect(
        translateDisplayNames({ obj: {}, tc: mockTc, locale: "en" }),
      ).toEqual({});
      expect(mockTc).not.toHaveBeenCalled();
    });
  });

  describe("translateFieldValuesInHoveredObject", () => {
    const tc = (str: string | null | unknown) => `mock translation of ${str}`;
    const mockTc = jest.fn();

    beforeEach(() => {
      mockTc.mockClear();
      mockTc.mockImplementation(tc);
    });

    it("should return object with null data when passed null", () => {
      const result = translateFieldValuesInHoveredObject(null, mockTc);
      expect(result).toEqual({ data: undefined });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should return object unchanged when data is undefined", () => {
      const obj: HoveredObject = { index: 1 };
      const result = translateFieldValuesInHoveredObject(obj, mockTc);
      expect(result).toEqual({ index: 1, data: undefined });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should translate string field values for categorical columns", () => {
      const categoryCol: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "category",
        display_name: "Category",
        base_type: "type/Text",
      };
      const countryCol: DatasetColumn = {
        semantic_type: "type/Country",
        source: "",
        name: "country",
        display_name: "Country",
        base_type: "type/Text",
      };
      const nameCol: DatasetColumn = {
        semantic_type: "type/Name",
        source: "",
        name: "Name",
        display_name: "Name",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        data: [
          { col: categoryCol, value: "Red", key: "test1" },
          { col: countryCol, value: "Blue", key: "test2" },
          { col: nameCol, value: "Green", key: "test3" },
        ],
      };
      const result = translateFieldValuesInHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: categoryCol, value: "mock translation of Red", key: "test1" },
        { col: countryCol, value: "mock translation of Blue", key: "test2" },
        { col: nameCol, value: "mock translation of Green", key: "test3" },
      ]);
      expect(mockTc).toHaveBeenCalledWith("Red");
      expect(mockTc).toHaveBeenCalledWith("Blue");
      expect(mockTc).toHaveBeenCalledWith("Green");
    });

    it("should not translate non-string values", () => {
      const categoryCol: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "category",
        display_name: "Category",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        data: [
          { col: categoryCol, value: 123, key: "test1" },
          { col: categoryCol, value: null, key: "test2" },
        ],
      };
      const result = translateFieldValuesInHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: categoryCol, value: 123, key: "test1" },
        { col: categoryCol, value: null, key: "test2" },
      ]);
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should not translate values when col is null", () => {
      const obj: HoveredObject = {
        data: [{ col: null, value: "test", key: "test1" }],
      };
      const result = translateFieldValuesInHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: null, value: "test", key: "test1" },
      ]);
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should preserve other properties of the hovered object", () => {
      const categoryCol: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "category",
        display_name: "Category",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        index: 5,
        seriesIndex: 2,
        value: "some value",
        data: [{ col: categoryCol, value: "Red", key: "test1" }],
      };
      const result = translateFieldValuesInHoveredObject(obj, mockTc);

      expect(result).toEqual({
        index: 5,
        seriesIndex: 2,
        value: "some value",
        data: [
          { col: categoryCol, value: "mock translation of Red", key: "test1" },
        ],
      });
      expect(mockTc).toHaveBeenCalledWith("Red");
    });
  });

  describe("translateFieldValuesInSeries", () => {
    const mockTC = jest.fn((x) => `mock translation of ${x}`);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should return the original series if no translations are available", () => {
      const series = createMockSeries();
      const result = translateFieldValuesInSeries(series, leaveUntranslated);
      expect(result).toEqual(series);
    });

    it("should translate all columns in the series", () => {
      const series = createMockSeries();
      series[0].data.cols = [
        createMockColumn({
          display_name: "Column 1",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          display_name: "Column 2",
          semantic_type: "type/Country",
        }),
      ];
      series[0].data.rows = [["a", "b"]];

      const result = translateFieldValuesInSeries(series, mockTC);

      expect(result[0].data.rows).toEqual([
        ["mock translation of a", "mock translation of b"],
      ]);
      expect(mockTC).toHaveBeenCalledWith("a");
      expect(mockTC).toHaveBeenCalledWith("b");
    });
  });

  describe("translateCardNames", () => {
    const mockTC = jest.fn((x) => `mock translation of ${x}`);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("translates card names in a series", () => {
      const series = createMockSeries([{ name: "a" }, { name: "b" }]);
      const result = translateCardNames(series, mockTC);
      expect(result[0].card.name).toEqual("mock translation of a");
    });
  });
});
