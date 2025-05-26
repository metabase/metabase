import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { HoveredObject } from "metabase/visualizations/types";
import type { DatasetColumn, DictionaryArray } from "metabase-types/api";

import {
  shouldTranslateFieldValuesOfColumn,
  translateContentString,
  translateDisplayNames,
  translateHoveredObject,
} from "./utils";

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

    it("should handle case sensitivity", () => {
      expect(translateContentString(mockDictionary, "es", "hello")).toBe(
        "hello",
      ); // no match
      expect(translateContentString(mockDictionary, "ES", "Hello")).toBe(
        "Hello",
      ); // no match
    });
  });

  describe("translateDisplayNames", () => {
    const mockTc = jest.fn(
      ((str: string) => `translated_${str}`) as ContentTranslationFunction,
    );

    beforeEach(() => {
      mockTc.mockClear();
      mockTc.mockImplementation((str: string) => `translated_${str}`);
    });

    it("should translate display_name fields in simple objects", () => {
      const input = { display_name: "Test Name", other_field: "unchanged" };
      const result = translateDisplayNames(input, mockTc);

      expect(result).toEqual({
        display_name: "translated_Test Name",
        other_field: "unchanged",
      });
      expect(mockTc).toHaveBeenCalledWith("Test Name");
    });

    it("should translate custom field names when specified", () => {
      const input = { title: "Test Title", name: "Test Name" };
      const result = translateDisplayNames(input, mockTc, ["title", "name"]);

      expect(result).toEqual({
        title: "translated_Test Title",
        name: "translated_Test Name",
      });
      expect(mockTc).toHaveBeenCalledWith("Test Title");
      expect(mockTc).toHaveBeenCalledWith("Test Name");
    });

    it("should handle arrays of objects", () => {
      const input = [
        { display_name: "First", id: 1 },
        { display_name: "Second", id: 2 },
      ];
      const result = translateDisplayNames(input, mockTc);

      expect(result).toEqual([
        { display_name: "translated_First", id: 1 },
        { display_name: "translated_Second", id: 2 },
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
      const result = translateDisplayNames(input, mockTc);

      expect(result).toEqual({
        display_name: "translated_Parent",
        child: {
          display_name: "translated_Child",
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
      const result = translateDisplayNames(input, mockTc);

      expect(result).toEqual({
        display_name: "translated_Root",
        items: [
          {
            display_name: "translated_Item 1",
            metadata: {
              display_name: "translated_Meta 1",
            },
          },
          {
            display_name: "translated_Item 2",
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
      const result = translateDisplayNames(input, mockTc);

      expect(result).toEqual({
        display_name: 123,
        other_display_name: null,
        another_display_name: undefined,
      });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should handle primitive values", () => {
      expect(translateDisplayNames("string", mockTc)).toBe("string");
      expect(translateDisplayNames(123, mockTc)).toBe(123);
      expect(translateDisplayNames(true, mockTc)).toBe(true);
      expect(translateDisplayNames(null, mockTc)).toBe(null);
      expect(translateDisplayNames(undefined, mockTc)).toBe(undefined);
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should create a deep copy and not mutate the original object", () => {
      const input = {
        display_name: "Original",
        nested: { display_name: "Nested" },
      };
      const result = translateDisplayNames(input, mockTc);

      expect(input.display_name).toBe("Original");
      expect(input.nested.display_name).toBe("Nested");
      expect(result.display_name).toBe("translated_Original");
      expect(result.nested.display_name).toBe("translated_Nested");
      expect(result).not.toBe(input);
      expect(result.nested).not.toBe(input.nested);
    });

    it("should handle empty arrays and objects", () => {
      expect(translateDisplayNames([], mockTc)).toEqual([]);
      expect(translateDisplayNames({}, mockTc)).toEqual({});
      expect(mockTc).not.toHaveBeenCalled();
    });
  });

  describe("shouldTranslateFieldValuesOfColumn", () => {
    it("should return true for Category semantic type", () => {
      const col: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Text",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(true);
    });

    it("should return true for State semantic type", () => {
      const col: DatasetColumn = {
        semantic_type: "type/State",
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Text",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(true);
    });

    it("should return true for Country semantic type", () => {
      const col: DatasetColumn = {
        semantic_type: "type/Country",
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Text",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(true);
    });

    it("should return false for other semantic types", () => {
      const col: DatasetColumn = {
        semantic_type: "type/Number",
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Integer",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(false);
    });

    it("should return false for null semantic type", () => {
      const col: DatasetColumn = {
        semantic_type: null,
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Text",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(false);
    });

    it("should return false for undefined semantic type", () => {
      const col: DatasetColumn = {
        semantic_type: undefined,
        source: "",
        name: "test",
        display_name: "Test",
        base_type: "type/Text",
      };
      expect(shouldTranslateFieldValuesOfColumn(col)).toBe(false);
    });
  });

  describe("translateHoveredObject", () => {
    const mockTc = jest.fn(
      ((str: string) => `translated_${str}`) as ContentTranslationFunction,
    );

    beforeEach(() => {
      mockTc.mockClear();
      mockTc.mockImplementation((str: string) => `translated_${str}`);
    });

    it("should return object with null data when passed null", () => {
      const result = translateHoveredObject(null, mockTc);
      expect(result).toEqual({ data: undefined });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should return object unchanged when data is undefined", () => {
      const obj: HoveredObject = { index: 1 };
      const result = translateHoveredObject(obj, mockTc);
      expect(result).toEqual({ index: 1, data: undefined });
      expect(mockTc).not.toHaveBeenCalled();
    });

    it("should translate string values for categorical columns", () => {
      const categoryCol: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "category",
        display_name: "Category",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        data: [
          { col: categoryCol, value: "Red", key: "test1" },
          { col: categoryCol, value: "Blue", key: "test2" },
        ],
      };
      const result = translateHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: categoryCol, value: "translated_Red", key: "test1" },
        { col: categoryCol, value: "translated_Blue", key: "test2" },
      ]);
      expect(mockTc).toHaveBeenCalledWith("Red");
      expect(mockTc).toHaveBeenCalledWith("Blue");
    });

    it("should translate string values for state columns", () => {
      const stateCol: DatasetColumn = {
        semantic_type: "type/State",
        source: "",
        name: "state",
        display_name: "State",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        data: [{ col: stateCol, value: "California", key: "test1" }],
      };
      const result = translateHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: stateCol, value: "translated_California", key: "test1" },
      ]);
      expect(mockTc).toHaveBeenCalledWith("California");
    });

    it("should translate string values for country columns", () => {
      const countryCol: DatasetColumn = {
        semantic_type: "type/Country",
        source: "",
        name: "country",
        display_name: "Country",
        base_type: "type/Text",
      };
      const obj: HoveredObject = {
        data: [{ col: countryCol, value: "United States", key: "test1" }],
      };
      const result = translateHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: countryCol, value: "translated_United States", key: "test1" },
      ]);
      expect(mockTc).toHaveBeenCalledWith("United States");
    });

    it("should not translate values for non-categorical columns", () => {
      const numberCol: DatasetColumn = {
        semantic_type: "type/Number",
        source: "",
        name: "amount",
        display_name: "Amount",
        base_type: "type/Integer",
      };
      const obj: HoveredObject = {
        data: [{ col: numberCol, value: "123", key: "test1" }],
      };
      const result = translateHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: numberCol, value: "123", key: "test1" },
      ]);
      expect(mockTc).not.toHaveBeenCalled();
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
      const result = translateHoveredObject(obj, mockTc);

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
      const result = translateHoveredObject(obj, mockTc);

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
      const result = translateHoveredObject(obj, mockTc);

      expect(result).toEqual({
        index: 5,
        seriesIndex: 2,
        value: "some value",
        data: [{ col: categoryCol, value: "translated_Red", key: "test1" }],
      });
      expect(mockTc).toHaveBeenCalledWith("Red");
    });

    it("should handle mixed column types in data array", () => {
      const categoryCol: DatasetColumn = {
        semantic_type: "type/Category",
        source: "",
        name: "category",
        display_name: "Category",
        base_type: "type/Text",
      };
      const numberCol: DatasetColumn = {
        semantic_type: "type/Number",
        source: "",
        name: "amount",
        display_name: "Amount",
        base_type: "type/Integer",
      };
      const obj: HoveredObject = {
        data: [
          { col: categoryCol, value: "Red", key: "test1" },
          { col: numberCol, value: "100", key: "test2" },
          { col: categoryCol, value: "Blue", key: "test3" },
        ],
      };
      const result = translateHoveredObject(obj, mockTc);

      expect(result?.data).toEqual([
        { col: categoryCol, value: "translated_Red", key: "test1" },
        { col: numberCol, value: "100", key: "test2" },
        { col: categoryCol, value: "translated_Blue", key: "test3" },
      ]);
      expect(mockTc).toHaveBeenCalledWith("Red");
      expect(mockTc).toHaveBeenCalledWith("Blue");
      expect(mockTc).toHaveBeenCalledTimes(2);
    });
  });
});
