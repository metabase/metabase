import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { editDashboard, restore, visitDashboard } from "e2e/support/helpers";

const TEST_DASHBOARD_NAME = "Orders in a dashboard";
const TEST_QUESTION_NAME = "Question#35037";

describe("should not redirect users to other pages when linking an entity (metabase#35037)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.intercept("GET", "/api/activity/recents?context=views").as(
      "recentViews",
    );
  });

  it("should not redirect users to recent item", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();

    cy.url().then(url => {
      cy.wrap(url).as("originUrl");
    });

    cy.icon("link").click();
    cy.wait("@recentViews");

    cy.findByTestId("recents-list-container").within(() => {
      cy.findByText(TEST_DASHBOARD_NAME).click();
    });

    cy.url().then(currentURL => {
      cy.get("@originUrl").should("eq", currentURL);
    });

    cy.findByTestId("recents-list-container").should("not.exist");

    cy.findByTestId("entity-edit-display-link")
      .findByText(TEST_DASHBOARD_NAME)
      .should("exist");
  });

  it("should not redirect users to search item", () => {
    cy.createNativeQuestion({
      name: TEST_QUESTION_NAME,
      native: { query: "SELECT 1" },
    });
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();

    cy.url().then(url => {
      cy.wrap(url).as("originUrl");
    });

    cy.icon("link").click();
    cy.findByTestId("custom-edit-text-link").type(TEST_QUESTION_NAME);
    cy.findByTestId("search-results-list").within(() => {
      cy.findByText(TEST_QUESTION_NAME).click();
    });

    cy.url().then(currentURL => {
      cy.get("@originUrl").should("eq", currentURL);
    });

    cy.findByTestId("search-results-list").should("not.exist");

    cy.findByTestId("entity-edit-display-link")
      .findByText(TEST_QUESTION_NAME)
      .should("exist");
  });
});
