import { restore, openProductsTable, popover } from "__support__/e2e/helpers";

describe("issue 21979", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ mode: "notebook" });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
    cy.findByText("Filter").click();
    cy.findByText("Created At").click();

    cy.findByText("Exclude...").click();
    cy.findByText("Days of the week...").click();

    popover().within(() => {
      cy.findByText("Monday").click();
      cy.button("Add filter").click();
    });

    cy.log("Make sure the filter references correct day in the UI");
    cy.findByText("Created At excludes Monday").should("be.visible");

    cy.button("Visualize").click();
    cy.wait("@dataset");

    // One of the products created on Monday
    cy.log("Make sure the query is correct");
    cy.findByText("Enormous Marble Wallet").should("not.exist");

    cy.log("Make sure we can re-enable the excluded filter");
    cy.findByText("Created At excludes Monday").click();

    popover().within(() => {
      cy.findByText("Monday").click();
      cy.findByText("Thursday").click();

      cy.button("Update filter").click();
      cy.wait("@dataset");
    });

    cy.findByText("Created At excludes Thursday").should("be.visible");
    cy.findByText("Enormous Marble Wallet").should("be.visible");
  });
});
