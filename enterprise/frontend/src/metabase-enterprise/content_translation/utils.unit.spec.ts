import type { DictionaryArray } from "metabase/i18n/types";

import { translateContentString } from "./utils";

describe("content_translation/utils", () => {
  describe("translateContentString", () => {
    const mockDictionary: DictionaryArray = [
      { locale: "es", msgid: "Product", msgstr: "Producto" },
      { locale: "es", msgid: "Created At", msgstr: "Creado el" },
      { locale: "de", msgid: "Product", msgstr: "Produkt" },
      { locale: "fr", msgid: "Product", msgstr: "Produit" },
      { locale: "es", msgid: "Empty", msgstr: "" },
      { locale: "es", msgid: "Whitespace", msgstr: "  " },
    ];

    describe("when translating a single string", () => {
      it("should return a translation when a matching msgid and locale are found", () => {
        expect(translateContentString(mockDictionary, "es", "Product")).toBe(
          "Producto",
        );
        expect(translateContentString(mockDictionary, "de", "Product")).toBe(
          "Produkt",
        );
      });

      it("should return the original string when no locale is provided", () => {
        expect(
          translateContentString(mockDictionary, undefined, "Product"),
        ).toBe("Product");
      });

      it("should return the original string when no dictionary is provided", () => {
        expect(translateContentString(undefined, "es", "Product")).toBe(
          "Product",
        );
      });

      it("should return the original string when no matching translation is found", () => {
        expect(translateContentString(mockDictionary, "es", "Category")).toBe(
          "Category",
        );
        expect(translateContentString(mockDictionary, "it", "Product")).toBe(
          "Product",
        );
      });

      it("should return the original string when the msgid is not a string", () => {
        expect(translateContentString(mockDictionary, "es", null)).toBeNull();
        expect(
          translateContentString(mockDictionary, "es", undefined),
        ).toBeUndefined();
      });

      it("should return the original string when msgid is empty or only whitespace", () => {
        expect(translateContentString(mockDictionary, "es", "")).toBe("");
        expect(translateContentString(mockDictionary, "es", "  ")).toBe("  ");
      });

      it("should return the original string when the translation is empty", () => {
        expect(translateContentString(mockDictionary, "es", "Empty")).toBe(
          "Empty",
        );
      });

      it("should return the original string when the translation is only whitespace", () => {
        expect(translateContentString(mockDictionary, "es", "Whitespace")).toBe(
          "Whitespace",
        );
      });
    });

    describe("when retrieving mapping of locales to translations", () => {
      it("should return a mapping of locales to translations when retrieveMapping is true", () => {
        const expected = {
          es: "Producto",
          de: "Produkt",
          fr: "Produit",
        };
        expect(
          translateContentString(mockDictionary, "any", "Product", true),
        ).toEqual(expected);
      });

      it("should use false as default value for retrieveMapping parameter", () => {
        // Verify the function works with default value (retrieveMapping = false)
        expect(translateContentString(mockDictionary, "es", "Product")).toBe(
          "Producto",
        );
      });

      it("should return undefined when no translations exist for the msgid", () => {
        expect(
          translateContentString(mockDictionary, "any", "Unknown", true),
        ).toBeUndefined();
      });

      it("should return undefined when dictionary is undefined", () => {
        expect(
          translateContentString(undefined, "any", "Product", true),
        ).toBeUndefined();
      });

      it("should return the original string when msgid is not a string", () => {
        expect(
          translateContentString(mockDictionary, "any", null, true),
        ).toBeNull();
        expect(
          translateContentString(mockDictionary, "any", undefined, true),
        ).toBeUndefined();
      });
    });
  });
});
