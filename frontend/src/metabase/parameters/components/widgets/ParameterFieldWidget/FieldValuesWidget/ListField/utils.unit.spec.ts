import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { FieldValue } from "metabase-types/api";

import { translateToGerman, translateToJapanese } from "./test-constants";
import { optionMatchesFilter, removeDiacritics } from "./utils";

describe("ListField - utils", () => {
  describe("isValidOptionItem", () => {
    const TEST_CASES: [
      expectedResult: boolean,
      optionItem: FieldValue,
      filter: string,
      translate?: ContentTranslationFunction,
    ][] = [
      // Test cases without localization
      [true, [6, "Marble Shoes"], "marble"],
      [true, [6, "Marble Shoes"], "6"],
      [true, [6], "6"],
      [true, [null, "Marble Shoes"], "marble"],
      [false, [6, "Marble Shoes"], "abcde"],
      [false, ["Gerät"], "app"],
      [true, ["Gerät"], "ger"],
      [true, ["Gerät"], "gerät"],
      [false, ["Apparat"], "ät"],
      [true, ["グッズ"], "グ"],

      // Test cases with localization
      [true, [6, "Marble Shoes"], "marm", translateToGerman], // 'marm' matches the translation of 'Marble Shoes'
      [true, [null, "Marble Shoes"], "marm", translateToGerman],
      [false, [6, "Marble Shoes"], "marble", translateToGerman], // 'marble' does not match the translation of 'Marble Shoes'
      [true, ["Gadget"], "ger", translateToGerman],
      [true, ["Gadget"], "gerät", translateToGerman],
      [false, ["Widget"], "ät", translateToGerman], // "ät" does not match the translation of Widget ("Apparat")
      [true, ["Products"], "グ", translateToJapanese],
    ];

    TEST_CASES.map(([expectedResult, option, filter, tc]) => {
      it(`"${filter}" ${expectedResult ? "matches" : "does not match"} ${option}`, () => {
        const result = optionMatchesFilter(option, filter, tc);
        expect(result).toEqual(expectedResult);
      });
    });
  });

  describe("removeDiacritics", () => {
    it("should remove diacritics from a string", () => {
      expect(removeDiacritics("Gerät")).toBe("Gerat");
    });

    it("should handle strings without diacritics", () => {
      expect(removeDiacritics("Gerat")).toBe("Gerat");
    });

    it("should return an empty string given an empty string", () => {
      expect(removeDiacritics("")).toBe("");
    });

    it("should remove diacritics from characters with multiple accents", () => {
      expect(removeDiacritics("café")).toBe("cafe");
      expect(removeDiacritics("jalapeño")).toBe("jalapeno");
    });

    it("should handle complex Unicode sequences", () => {
      expect(removeDiacritics("ḡ")).toBe("g");
    });

    it("should remove diacritics from combined characters", () => {
      expect(removeDiacritics("e\u0301")).toBe("e");
    });
  });
});
