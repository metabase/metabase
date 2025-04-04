import path from "path";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;
const { H } = cy;

const sampleDictionary = `
Language,String,Translation
de,Title,Titel
de,Vendor,Anbieter
de,Rating,Bewertung
de,Category,Kategorie
de,Created At,Erstellt am
de,Price,Preis
`;

describe("scenarios > admin > localization > content translation", () => {
  before(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
  });

  describe("should be able to upload a translation dictionary and see the following string translated", () => {
    before(() => {
      cy.visit("/admin/settings/localization");

      cy.get("#content-translation-dictionary-upload-input").selectFile(
        {
          contents: Cypress.Buffer.from(sampleDictionary),
          fileName: "content_translations.csv",
          mimeType: "text/csv",
        },
        { force: true },
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Dictionary uploaded/g).should("be.visible");

      cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, { locale: "de" });

      cy.get<number>("@collectionId").then((collection_id) => {
        cy.log("Create a model");

        H.createQuestion(
          {
            name: "Products",
            query: {
              "source-table": PRODUCTS_ID,
            },
            collection_id,
          },
          { wrapId: true, idAlias: "productsQuestionId" },
        );
      });
    });

    describe("On the question page", () => {
      before(() => {
        cy.get<number>("@productsQuestionId").then((productsQuestionId) => {
          cy.visitQuestion(productsQuestionId);
        });
      });

      it("column names are localized", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Titel").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Anbieter").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Bewertung").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Kategorie").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Erstellt am").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Preis").should("be.visible");
      });
    });
  });

  describe("should be able to download a translation dictionary", () => {
    let fileContents = "";
    before(() => {
      cy.visit("/admin/settings/localization");
      cy.button(/Download translation dictionary/g).click();
      H.modal().within(() => {
        cy.findByText(/Download translation dictionary/g);
        cy.findByText("French").click();
        cy.findByText("Spanish").click();
        cy.button("Download").click();
      });
      const downloadsFolder = Cypress.config("downloadsFolder");
      cy.readFile(
        path.join(downloadsFolder, "content-translations-es,fr.csv"),
      ).then((contents) => {
        fileContents = contents;
      });
    });

    it("with raw table names", () => {
      expect(fileContents).to.include(",Products,");
    });

    it("with raw column names", () => {
      expect(fileContents).to.include(",Vendor,");
      //
    });

    it("with raw database names", () => {
      expect(fileContents).to.include(",Sample Database,");
      // TODO: Add more database names
      expect(fileContents).to.include(",Sample Database,");
    });

    it("with raw strings from results", () => {
      expect(fileContents).to.include(",Enormous Aluminum Shirt,");
    });

    it("with field values", () => {
      // TODO: I'm not sure what the difference is between raw strings and field values
      // field values
    });
  });

  // TODO: Test that uploaded translations appear when re-downloading
});
