import path from "path";

import { parse } from "csv-parse/browser/esm/sync";

import { type DictionaryArray, isDictionaryArray } from "metabase-types/api";

import {
  germanFieldNames,
  nonAsciiFieldNames,
  portugueseFieldNames,
} from "./constants";
import {
  assertOnlyTheseTranslationsAreStored,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > admin > localization > content translation", () => {
  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("admin settings configuration form is not present", () => {
      cy.visit("/admin/settings/localization");
      cy.findByTestId("content-translation-configuration").should("not.exist");
    });
  });

  describe("ee", () => {
    beforeEach(() => {
      cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    describe("The translation download button", () => {
      it("downloads the uploaded translations", () => {
        uploadTranslationDictionary(germanFieldNames);
        cy.visit("/admin/settings/localization");
        cy.findByTestId("content-translation-configuration")
          .button(/Download translation dictionary/i)
          .click();
        const downloadsFolder = Cypress.config("downloadsFolder");
        cy.readFile(
          path.join(
            downloadsFolder,
            "metabase-content-translation-dictionary.csv",
          ),
        ).then((fileContents) => {
          expect(fileContents).to.include("de,Rating,Bewertung");
        });
      });
    });

    describe("The translation upload form", () => {
      it("accepts a CSV upload with ASCII characters", () => {
        uploadTranslationDictionary(germanFieldNames);
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });

      it("accepts a CSV upload with non-ASCII characters", () => {
        uploadTranslationDictionary(nonAsciiFieldNames);
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );
        assertOnlyTheseTranslationsAreStored(nonAsciiFieldNames);
      });

      it("accepts a CSV upload with a hyphenated locale", () => {
        uploadTranslationDictionary(portugueseFieldNames);
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );
        cy.signInAsNormalUser();
        assertOnlyTheseTranslationsAreStored(portugueseFieldNames);
      });

      it("does not store rows with translations made of only whitespace and/or semicolons", () => {
        const blankTranslation = { locale: "de", msgid: "Cat", msgstr: "" };
        const translationWithJustSpaces = {
          locale: "de",
          msgid: "Spaces",
          msgstr: "  ",
        };
        const translationWithJustTabs = {
          locale: "de",
          msgid: "Tabs",
          msgstr: "\t\t",
        };
        const translationWithJustSemicolons = {
          locale: "de",
          msgid: "Semicolons",
          msgstr: ";;",
        };
        const translationsWithBlanks = [
          ...germanFieldNames,
          blankTranslation,
          translationWithJustSpaces,
          translationWithJustTabs,
          translationWithJustSemicolons,
        ];
        uploadTranslationDictionary(translationsWithBlanks);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });

      it("erases previously stored translations when a new CSV is uploaded", () => {
        uploadTranslationDictionary(germanFieldNames);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
        uploadTranslationDictionary(nonAsciiFieldNames);
        assertOnlyTheseTranslationsAreStored(nonAsciiFieldNames);
      });
    });
  });
});

export const parseCSVFromString = (str: string): DictionaryArray => {
  try {
    const strings: unknown = parse(str, {
      delimiter: [",", "\t", "\n"],
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: '"',
      escape: "\\",
    }).flat();
    if (isDictionaryArray(strings)) {
      return strings;
    }
    throw new Error("Invalid dictionary");
  } catch (err) {
    return [];
  }
};
