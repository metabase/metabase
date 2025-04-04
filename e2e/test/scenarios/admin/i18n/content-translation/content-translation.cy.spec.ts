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

      H.createQuestion(
        {
          name: "Products",
          query: {
            "source-table": PRODUCTS_ID,
          },
        },
        { wrapId: true, idAlias: "productsQuestionId" },
      );
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
});
