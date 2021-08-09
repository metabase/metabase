import { restore } from "__support__/e2e/cypress";

import {
  addFiltersToDashboard,
  saveCard,
} from "../../metabase/scenarios/dashboard/helpers/e2e-filter-helpers";

const questionParams = {
  name: "14473",
  native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
};

describe("visual tests > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows basic dashboard", () => {
    cy.createNativeQuestion(questionParams).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard("14473D").then(({ body: { id: dashboardId } }) => {
          cy.log("Add 4 filters to the dashboard");

          addFiltersToDashboard(dashboardId);

          saveCard(dashboardId, questionId);

          cy.visit(`/dashboard/${dashboardId}`);

          openAddQuestionSidebar();

          cy.findByText("Our analytics");

          cy.percySnapshot(
            "Shows dashboard sidebar to add question " + Date.now(),
          );
        });
      },
    );
  });
});

function openAddQuestionSidebar() {
  cy.icon("pencil").click();
  cy.get(".QueryBuilder-section .Icon-add").click();
}
