import {
  restore,
  visitDashboard,
  openProductsTable,
  saveDashboard,
} from "e2e/support/helpers";

describe("issue 26826", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(1);
  });

  it("adding question to one dashboard shouldn't affect unrelated dashboards (metabase#26826)", () => {
    openProductsTable();
    saveQuestion();
    addQuestionToDashboardFromSaveModal();

    openRecentItemFromSearch("Orders in a dashboard");
    cy.get(".Card").should("have.length", 1);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });
});

function saveQuestion() {
  cy.intercept("POST", "/api/card").as("saveQuestion");

  cy.findByText("Save").click();

  cy.get(".Modal").button("Save").click();
  cy.wait("@saveQuestion");
}

function addQuestionToDashboardFromSaveModal(dashboardName = "foo") {
  cy.findByText("Yes please!").click();
  cy.findByText("Create a new dashboard").click();

  cy.findByLabelText("Name").type(dashboardName).blur();
  cy.button("Create").click();

  saveDashboard();
}

function openRecentItemFromSearch(item) {
  cy.findByPlaceholderText(/^Search/).click();
  cy.findAllByTestId("recently-viewed-item-title").contains(item).click();
}
