import path from "path";

import {
  getCSVWithHeaderRow,
  uploadTranslationDictionaryViaAPI,
} from "e2e/support/helpers/e2e-content-translation-helpers";

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
  generateLargeCSV,
  uploadTranslationDictionary,
} from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > admin > embedding > guest embeds> content translation", () => {
  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("admin settings configuration form is not present", () => {
      cy.visit("/admin/embedding/guest");
      cy.findByTestId("content-translation-configuration").should("not.exist");
    });
  });

  describe("ee", () => {
    before(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.snapshot("snapshot-for-upload-and-download");
    });

    beforeEach(() => {
      cy.intercept(
        "POST",
        "api/ee/content-translation/upload-dictionary",
        cy.spy().as("uploadDictionarySpy"),
      ).as("uploadDictionary");
      H.restore("snapshot-for-upload-and-download" as any);
      cy.signInAsAdmin();
    });

    describe("The translation download button", () => {
      it("downloads the stored translations", () => {
        uploadTranslationDictionaryViaAPI(germanFieldNames);
        cy.visit("/admin/embedding");
        cy.findByTestId("content-translation-configuration")
          .button(/Get translation dictionary template/i)
          .click();
        const downloadsFolder = Cypress.config("downloadsFolder");
        cy.readFile(
          path.join(downloadsFolder, "metabase-content-translations.csv"),
        ).then((fileContents) => {
          expect(fileContents).to.include("de,Rating,Bewertung");
        });
      });
    });

    describe("The translation upload form", () => {
      it("accepts a CSV upload with ASCII characters", () => {
        uploadTranslationDictionary(germanFieldNames);
        cy.findByRole("status").findByText("Dictionary uploaded");
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
        nonAsciiFieldNames.forEach(({ locale, msgid, msgstr }) => {
          assertOnlyTheseTranslationsAreStored(
            [{ locale, msgid, msgstr }],
            locale,
          );
        });
      });

      it("accepts a CSV upload with a hyphenated locale", () => {
        uploadTranslationDictionary(portugueseFieldNames);
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );
        cy.signInAsNormalUser();
        assertOnlyTheseTranslationsAreStored(portugueseFieldNames, "pt-BR");
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
        cy.findAllByRole("alert")
          .contains(/couldn.*t upload the file/)
          .should("exist");
        cy.findAllByRole("alert")
          .contains(
            new RegExp(
              `Row ${stringTranslatedTwice.length + 1}.*earlier in the file`,
            ),
          )
          .should("exist");
      });

      it("rejects a CSV upload with invalid locale in one row", () => {
        uploadTranslationDictionary(invalidLocaleXX);
        cy.findAllByRole("alert")
          .contains(/couldn.*t upload the file/)
          .should("exist");
        cy.findAllByRole("alert")
          .contains(/Row 2: Invalid locale: xx/)
          .should("exist");
      });

      it("erases previously stored translations when a new CSV is uploaded", () => {
        uploadTranslationDictionary(germanFieldNames);
        assertOnlyTheseTranslationsAreStored(germanFieldNames).then(() => {
          const oneArabicFieldName = [nonAsciiFieldNames[0]];
          uploadTranslationDictionary(oneArabicFieldName);
          assertOnlyTheseTranslationsAreStored(oneArabicFieldName, "ar");
        });
      });

      it("does not erase previously stored translations when an upload fails", () => {
        uploadTranslationDictionary(germanFieldNames);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
        uploadTranslationDictionary(invalidLocaleXX);
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });

      it("rejects a CSV upload with invalid locales in multiple rows", () => {
        uploadTranslationDictionary(multipleInvalidLocales);
        cy.findAllByRole("alert")
          .contains(/couldn.*t upload the file/)
          .should("exist");
        cy.log("The first error is in row 2 (the first row is the header)");
        cy.findAllByRole("alert")
          .contains(/Row 2: Invalid locale/)
          .should("exist");
        cy.findAllByRole("alert")
          .contains(/Row 5: Invalid locale/)
          .should("exist");
      });

      it("rejects, in the frontend, a CSV upload that is too big", () => {
        cy.visit("/admin/embedding");
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              generateLargeCSV({ sizeInMebibytes: 1.6 }),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true }, // We need this because the input has display: none
        );

        cy.findByRole("dialog", { name: /upload new dictionary/i })
          .button("Replace existing dictionary")
          .click();

        cy.findAllByRole("alert")
          .contains(/The file is larger than 1.5 MB/)
          .should("exist");
        cy.log(
          "The frontend should prevent the upload attempt; the endpoint should not be called",
        );
        cy.get("@uploadDictionarySpy").should("not.have.been.called");
      });

      it("rejects invalid CSV", () => {
        cy.visit("/admin/embedding");
        const validCSV = getCSVWithHeaderRow(germanFieldNames);
        const invalidCSV = validCSV + '\nde,Price,"Preis"X';

        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(invalidCSV),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        cy.findByRole("dialog", { name: /upload new dictionary/i })
          .button("Replace existing dictionary")
          .click();
        cy.findAllByRole("alert")
          .contains(/CSV error/)
          .should("exist");
        cy.wait("@uploadDictionary");
        cy.findByRole("status").findByText("Could not upload dictionary");
      });
    });
  });
});
