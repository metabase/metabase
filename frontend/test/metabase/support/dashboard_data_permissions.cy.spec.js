import { signIn, restore, popover, selectDashboardFilter } from "__support__/cypress";

function filterDashboard() {
  cy.visit("/dashboard/1");
  cy.contains("Orders");

  cy.contains("Category").type("Aero");

  // We should get a suggested response and be able to click it
  cy.contains("Aerodynamic").click();
  cy.contains("Add filter").click();
  cy.contains("Rows 1-1 of 96");
}

describe("support > permissions (metabase#8472)", () => {
  before(() => {
    restore();
    signIn("admin");

    // Setup a dashboard with a text filter
    cy.visit("/dashboard/1");
    // click pencil icon to edit
    cy.get(".Icon-pencil").click();

    cy.get(".Icon-funnel_add").click();
    popover()
      .contains("Other Categories")
      .click();

    // Filter the first card by product category
    selectDashboardFilter(cy.get(".DashCard").first(), "Title");

    cy.contains("Done").click();
    cy.contains("Save").click();
    cy.contains("Orders in a dashboard").click();
  });

  it("should allow an admin user to select the filter", () => {
    signIn("admin");
    filterDashboard();
  });

  it.skip("should allow a nodata user to select the filter", () => {
    signIn("nodata");
    filterDashboard();
  });
});
