import { germanFieldNames, portugueseFieldNames } from "./constants";
import {
  assertOnlyTheseTranslationsAreStored,
  getCSVWithHeaderRow,
  uploadTranslationDictionaryViaAPI,
} from "./helpers/e2e-content-translation-helpers";

const { H } = cy;

describe("scenarios > admin > localization > content translation > confirmation modal", () => {
  describe("ee", () => {
    before(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    beforeEach(() => {
      cy.intercept("GET", "api/ee/content-translation/current").as(
        "getCurrentTranslations",
      );
      cy.intercept("POST", "api/ee/content-translation/upload-dictionary").as(
        "uploadDictionary",
      );
      H.restore();
      cy.signInAsAdmin();
    });

    describe("When no existing translations", () => {
      it("uploads directly without showing confirmation modal", () => {
        cy.visit("/admin/settings/localization");

        // Upload should go through directly without modal
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(germanFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        // Should show success message
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );

        // Verify translations were stored
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });
    });

    describe("When existing translations would be replaced", () => {
      beforeEach(() => {
        // Setup: Upload initial translations via API
        uploadTranslationDictionaryViaAPI(germanFieldNames);
      });

      it("shows confirmation modal when uploading different translations", () => {
        cy.visit("/admin/settings/localization");

        // Attempt to upload different translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(portugueseFieldNames),
            ),
            fileName: "portuguese-translations.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");
          cy.findByText(
            "Warning: This will replace all existing translations",
          ).should("be.visible");
          cy.findByText("File: portuguese-translations.csv").should(
            "be.visible",
          );

          // Should show removed translations
          cy.findByText(/translation\(s\) will be deleted/).should(
            "be.visible",
          );
          cy.findByText('de: "Rating" → "Bewertung"').should("be.visible");

          // Should show added translations
          cy.findByText(/new translation\(s\) will be added/).should(
            "be.visible",
          );
          cy.findByText('pt-BR: "Category" → "Categoria"').should("be.visible");
        });
      });

      it("cancels upload when clicking Cancel in confirmation modal", () => {
        cy.visit("/admin/settings/localization");

        // Attempt to upload different translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(portugueseFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");

          // Click Cancel
          cy.findByText("Cancel").click();
        });

        // Original translations should still exist
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });

      it("replaces translations when clicking Replace Translations in confirmation modal", () => {
        cy.visit("/admin/settings/localization");

        // Attempt to upload different translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(portugueseFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );
        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");

          // Click Replace Translations
          cy.findByText(/Replace translations/).click();
        });

        // Should upload and show success
        cy.wait("@uploadDictionary");
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );

        // New translations should be stored
        assertOnlyTheseTranslationsAreStored(portugueseFieldNames, "pt-BR");
      });

      it("handles race condition when translations change before confirmation", () => {
        cy.visit("/admin/settings/localization");

        // Attempt to upload different translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(portugueseFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");

          // Simulate someone else changing translations in the background
          // by uploading different translations via API with a different hash
          uploadTranslationDictionaryViaAPI([
            { locale: "fr", msgid: "Category", msgstr: "Catégorie" },
          ]);

          // Now click Replace Translations
          cy.findByText("Replace Translations").click();
        });

        // Should show race condition error
        cy.findAllByRole("alert")
          .contains(/translation data has been modified by another user/i)
          .should("be.visible");
      });

      it("shows updated translations when some overlap exists", () => {
        const overlappingTranslations = [
          { locale: "de", msgid: "Rating", msgstr: "Neue Bewertung" }, // Updated
          { locale: "de", msgid: "Category", msgstr: "Kategorie" }, // Same as original
          { locale: "fr", msgid: "Dashboard", msgstr: "Tableau de bord" }, // New
        ];

        cy.visit("/admin/settings/localization");

        // Attempt to upload overlapping translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(overlappingTranslations),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");

          // Should show updated translations
          cy.findByText(/translation\(s\) will be updated/).should(
            "be.visible",
          );
          cy.findByText('Old: "Bewertung"').should("be.visible");
          cy.findByText('New: "Neue Bewertung"').should("be.visible");

          // Should show unchanged count
          cy.findByText(/translation\(s\) will remain unchanged/).should(
            "be.visible",
          );

          // Should show new translations
          cy.findByText(/new translation\(s\) will be added/).should(
            "be.visible",
          );
          cy.findByText('fr: "Dashboard" → "Tableau de bord"').should(
            "be.visible",
          );

          // Should show removed translations
          cy.findByText(/translation\(s\) will be deleted/).should(
            "be.visible",
          );
        });
      });
    });

    describe("When uploading identical translations", () => {
      beforeEach(() => {
        // Setup: Upload initial translations via API
        uploadTranslationDictionaryViaAPI(germanFieldNames);
      });

      it("uploads directly without showing confirmation modal when no changes", () => {
        cy.visit("/admin/settings/localization");

        // Upload identical translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(germanFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        // Should show success message
        cy.findByTestId("content-localization-setting").findByText(
          "Dictionary uploaded",
        );

        // Verify same translations are still stored
        assertOnlyTheseTranslationsAreStored(germanFieldNames);
      });
    });

    describe("Hash validation", () => {
      beforeEach(() => {
        // Setup: Upload initial translations via API
        uploadTranslationDictionaryViaAPI(germanFieldNames);
      });

      it("includes hash in confirmation modal for race condition detection", () => {
        cy.visit("/admin/settings/localization");

        // Attempt to upload different translations
        cy.get("#content-translation-dictionary-upload-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              getCSVWithHeaderRow(portugueseFieldNames),
            ),
            fileName: "file.csv",
            mimeType: "text/csv",
          },
          { force: true },
        );

        H.modal().within(() => {
          // Should show confirmation modal
          cy.findByText("Review changes").should("be.visible");

          // Should include hidden hash field for race condition detection
          cy.findByTestId("translations-hash")
            .should("exist")
            .should("have.attr", "value");
        });
      });
    });
  });
});
