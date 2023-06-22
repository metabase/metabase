import {
  restore,
  popover,
  selectDashboardFilter,
  visitDashboard,
} from "e2e/support/helpers";

function filterDashboard(suggests = true) {
  visitDashboard(1);
  cy.contains("Orders");
  cy.contains("Text").click();

  // We should get a suggested response and be able to click it if we're an admin
  if (suggests) {
    cy.findByPlaceholderText("Search by Address").type("Main Street");
    cy.contains("100 Main Street").click();
  } else {
    cy.findByPlaceholderText("Search by Address")
      .type("100 Main Street")
      .blur();
    cy.wait("@search").should(({ response }) => {
      expect(response.statusCode).to.equal(403);
    });
  }
  cy.contains("Add filter").click({ force: true });
  cy.contains("100 Main Street");
  cy.contains(/Rows \d-\d+ of 23/);
}

describe("support > permissions (metabase#8472)", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/dashboard/1/params/*/search/*").as("search");

    restore();
    cy.signInAsAdmin();

    // Setup a dashboard with a text filter
    visitDashboard(1);
    // click pencil icon to edit
    cy.icon("pencil").click();

    cy.icon("filter").click();
    popover().contains("Text or Category").click();

    popover().contains("Is").click();

    // Filter the first card by User Address
    selectDashboardFilter(cy.get(".DashCard").first(), "Address");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Done").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders in a dashboard").click();
  });

  it("should allow an admin user to select the filter", () => {
    filterDashboard();
  });

  it("should allow a nodata user to select the filter", () => {
    cy.signIn("nodata");
    filterDashboard();
  });

  it("should not allow a nocollection user to visit the page, hence cannot see the filter", () => {
    cy.signIn("nocollection");
    cy.request({
      method: "GET",
      url: "/api/dashboard/1",
      failOnStatusCode: false,
    }).should(xhr => {
      expect(xhr.status).to.equal(403);
    });
  });
});
