import { restore, popover, selectDashboardFilter } from "__support__/cypress";

function filterDashboard(suggests = true) {
  cy.visit("/dashboard/1");
  cy.contains("Orders");

  // We should get a suggested response and be able to click it if we're an admin
  if (suggests) {
    cy.contains("Category").type("Aero");
    cy.contains("Aerodynamic").click();
  } else {
    cy.contains("Category").type("Aerodynamic Bronze Hat");
    cy.wait("@search").should(xhr => {
      expect(xhr.status).to.equal(403);
    });
  }
  cy.contains("Add filter").click({ force: true });
  cy.contains("Aerodynamic Bronze Hat");
  cy.contains(/Rows \d-\d of 96/);
}

describe("support > permissions (metabase#8472)", () => {
  beforeEach(() => {
    cy.intercept("/api/session/properties", req => {
      req.continue(res => {
        res["field-filter-operators-enabled?"] = true;
      });
    });

    restore();
    cy.signInAsAdmin();

    // Setup a dashboard with a text filter
    cy.visit("/dashboard/1");
    // click pencil icon to edit
    cy.icon("pencil").click();

    cy.icon("filter").click();
    popover()
      .contains("Other Categories")
      .click();

    popover()
      .contains("Dropdown")
      .click();

    // Filter the first card by product category
    selectDashboardFilter(cy.get(".DashCard").first(), "Title");

    cy.contains("Done").click();
    cy.contains("Save").click();
    cy.contains("Orders in a dashboard").click();
  });

  it("should allow an admin user to select the filter", () => {
    filterDashboard();
  });

  it("should allow a nodata user to select the filter", () => {
    cy.server();
    cy.route(
      "GET",
      "/api/dashboard/1/params/*/search/Aerodynamic Bronze Hat",
    ).as("search");

    cy.signIn("nodata");
    filterDashboard(false);
  });
});
