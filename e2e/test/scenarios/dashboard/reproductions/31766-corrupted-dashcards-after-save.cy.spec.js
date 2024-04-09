import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  modal,
  restore,
  visitDashboard,
  getTextCardDetails,
  updateDashboardCards,
  saveDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 31766", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  it("should not corrupt dashboard data (metabase#31766)", () => {
    const questionDetails = {
      name: "Orders",
      query: { "source-table": ORDERS_ID, limit: 5 },
    };

    const dashboardDetails = { name: "Orders in a dashboard" };

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
      cardDetails: { size_x: 16, size_y: 8 },
    }).then(({ body: { dashboard_id, question_id, id: dashcard_id } }) => {
      const textCard = getTextCardDetails({
        row: 0,
        size_x: 24,
        size_y: 1,
        text: "top",
      });
      const questionCard = {
        row: 2,
        size_x: 16,
        size_y: 6,
        id: dashcard_id,
        card_id: question_id,
      };

      updateDashboardCards({ dashboard_id, cards: [textCard, questionCard] });

      visitDashboard(dashboard_id);
      editDashboard(dashboard_id);
    });

    // update text card
    cy.findByTestId("editing-dashboard-text-preview").type(1);

    saveDashboard();

    // visit question
    cy.findAllByTestId("dashcard").eq(1).findByText("Orders").click();

    cy.log("Update viz settings");

    cy.findByTestId("view-footer")
      .findByRole("button", { name: "Visualization" })
      .click();
    cy.findByTestId("Detail-button").click();

    saveUpdatedQuestion();

    assertQuestionIsUpdatedWithoutError();
  });
});

function saveUpdatedQuestion() {
  cy.intercept("PUT", "/api/card/*").as("updateQuestion");

  cy.findByText("Save").click();
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
}

function assertQuestionIsUpdatedWithoutError() {
  cy.wait("@updateQuestion");
  modal().should("not.exist");
}
