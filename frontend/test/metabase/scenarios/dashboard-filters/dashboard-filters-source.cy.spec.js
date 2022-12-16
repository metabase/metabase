import {
  editDashboard,
  modal,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "scalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should be able to use a static list source", () => {
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
    setFilter("Text or Category", "Dropdown");
    cy.findByText("Custom list").click();
    modal().within(() => {
      cy.findByPlaceholderText(/banana/).type("Apple\nGoogle");
      cy.button("Done").click();
    });
    cy.findByText("Select…").click();
    popover().within(() => {
      cy.findByText("Source").click();
    });
    saveDashboard();

    cy.findByText("Text").click();
    popover().within(() => {
      cy.findByText("Apple").should("be.visible");
      cy.findByText("Google").click();
      cy.button("Add filter").click();
    });
    cy.wait("@getCardQuery");
  });
});
