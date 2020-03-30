import { signIn, restore, popover, modal, selectDashboardFilter } from "__support__/cypress";

describe("support > permissions", () => {
  before(restore);

  it("should set up a dashboard with a text filter", () => {
    signIn("admin");
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

    // confirm filter ios still there
    // cy.get("input[placeholder=Category]");


    cy.contains("Orders in a dashboard").click();
  });

  it("should allow a nodata user to select the filter", () => {
      signIn("nodata");
      cy.visit("/dashboard/1");
      cy.contains("Orders");

      cy.contains("Category").type("Aero");

      // We should get a suggested response and be able to click it
      cy.contains("Aerodynamic").click();
      cy.contains("Add filter").click();
      cy.contains("Rows 1-1 of 96");
  })
})