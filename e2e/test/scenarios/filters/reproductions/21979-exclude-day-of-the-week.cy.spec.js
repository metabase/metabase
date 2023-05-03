import { restore, openProductsTable, popover } from "e2e/support/helpers";

describe("issue 21979", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ mode: "notebook" });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Days of the week...").click();

    popover().within(() => {
      cy.findByText("Monday").click();
      cy.button("Add filter").click();
    });

    cy.log("Make sure the filter references correct day in the UI");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At excludes Monday").should("be.visible");

    cy.button("Visualize").click();
    cy.wait("@dataset");

    // One of the products created on Monday
    cy.log("Make sure the query is correct");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Enormous Marble Wallet").should("not.exist");

    cy.log("Make sure we can re-enable the excluded filter");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At excludes Monday").click();

    popover().within(() => {
      cy.findByText("Monday").click();
      cy.findByText("Thursday").click();

      cy.button("Update filter").click();
      cy.wait("@dataset");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At excludes Thursday").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Enormous Marble Wallet").should("be.visible");
  });
});
