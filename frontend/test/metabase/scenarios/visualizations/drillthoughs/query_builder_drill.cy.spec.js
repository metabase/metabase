import { restore, signInAsAdmin, openProductsTable, sidebar } from "__support__/cypress";
// Imported from drillthroughs.e2e.spec.js

describe("drill-through action inside query builder", () => {

  describe("for an unsaved question", () => {
    before(() => {
      restore();
      signInAsAdmin();
      // Build question without saving
      openProductsTable();
      cy.findByText("Summarize").click();
      sidebar().within(() => {
        cy.contains("Category").click();
      })

      // Drill-through last bar
      cy.get(".bar")
        .last()
        .click({ force: true });
      cy.findByText("View these Products").click();
    })
    
    it("results in a correct url", () => {
      cy.url().should("include", "/question#" )
    });
    // it("shows the name and lineage correctly", () => {});
    it("results in correct query result", () => {
      cy.findAllByText("Widget");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Doohickey").should("not.exist");
    });
  });

  describe("for a clean saved question", () => {
    // **** NOT DONE
    before(() => {
      restore();
      signInAsAdmin();
    });
    it("results in a correct url", () => {
      cy.visit("/collection/root");
    });
    // it("shows the name and lineage correctly", () => {});
    it("results in correct query result", () => {});
  });

  describe("for a dirty saved question", () => {
    before(() => {
      restore();
      signInAsAdmin();
      
      cy.visit("/question/3")
      cy.findByText("Orders, Count, Grouped by Created At (year)")
      cy.get(".dot")
        .last()
        .click({ force: true });
      cy.findByText("View these Orders").click();
    });
    
    it("results in a correct url", () => {
      cy.url().should("include", "/question#")
    });
    // it("shows the name and lineage correctly", () => {});
    it("results in correct query result", () => {
      cy.findByText("Created At is 2020");
      cy.contains("2020,");
      cy.findByText("2019").should("not.exist");
    });
  });
});
