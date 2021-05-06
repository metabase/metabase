import { restore } from "__support__/e2e/cypress";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";

describe("URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("browse databases", () => {
    ["/", "/browse"].forEach(url => {
      it(`should slugify database name when opening it from "${url}"`, () => {
        cy.visit(url);
        cy.findByText("Sample Dataset").click();
        cy.findByText("Sample Dataset");
        cy.url().should("match", /\/browse\/1-sample-dataset$/);
      });
    });

    [
      `browse/${SAVED_QUESTIONS_VIRTUAL_DB_ID}`,
      `browse/${SAVED_QUESTIONS_VIRTUAL_DB_ID}-saved-questions`,
    ].forEach(url => {
      it("should open 'Saved Questions' database correctly", () => {
        cy.visit(url);
        cy.findByText("Saved Questions");
        cy.url().should("include", url);
      });
    });
  });

  describe.only("collections", () => {
    ["/", "/collection/root"].forEach(url => {
      it(`should slugify collection name when opening it from "${url}"`, () => {
        cy.visit(url);
        cy.findByText("First collection").click();
        cy.url().should("match", /\/collection\/9-first-collection$/);
      });
    });

    it("should not slugify users' collections page URL", () => {
      cy.visit("/collection/root");
      cy.findByText("Other users' personal collections").click();
      cy.findByText("All personal collections");
      cy.url().should("match", /\/collection\/users$/);
    });
  });
});
