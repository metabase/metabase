import {
  germanFieldNames,
  invalidLocaleXX,
  multipleInvalidLocales,
  nonAsciiFieldNames,
  portugueseFieldNames,
  stringTranslatedTwice,
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
      cy.findByTestId("content-localization-setting").should("not.exist");
      cy.findByTestId("admin-layout-content")
        .findByText(/translation dictionary/i)
        .should("not.exist");
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

      it("rejects a CSV upload that provides two translations for the same string", () => {
        uploadTranslationDictionary(stringTranslatedTwice);
        cy.findByTestId("content-localization-setting").within(() => {
          cy.findByText(/We couldn't upload the file/);
          cy.findByText(
            new RegExp(
              `Row ${stringTranslatedTwice.length + 1}.*earlier in the file`,
            ),
          );
        });
      });

      it("rejects a CSV upload with invalid locale in one row", () => {
        uploadTranslationDictionary(invalidLocaleXX);
        cy.findByTestId("content-localization-setting").within(() => {
          cy.findByText(/We couldn't upload the file/);
          cy.log("The error is in row 2 (the first row is the header)");
          cy.findByText(/Row 2: Invalid locale: xx/);
        });
      });

      it("erases previously stored translations when a new CSV is uploaded", () => {
        uploadTranslationDictionary(germanFieldNames);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
        uploadTranslationDictionary(nonAsciiFieldNames);
        assertOnlyTheseTranslationsAreStored(nonAsciiFieldNames);
      });

      it("does not erase previously stored translations when an upload fails", () => {
        uploadTranslationDictionary(germanFieldNames);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
        uploadTranslationDictionary(invalidLocaleXX);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });

      it("rejects a CSV upload with invalid locales in multiple rows", () => {
        uploadTranslationDictionary(multipleInvalidLocales);
        cy.findByTestId("content-localization-setting").within(() => {
          cy.findByText(/We couldn't upload the file/);
          cy.log("The first error is in row 2 (the first row is the header)");
          cy.findByText(/Row 2: Invalid locale: ze/);
          cy.findByText(/Row 5: Invalid locale: qe/);
        });
      });
    });
  });
});
