import { addFiltersToDashboard } from "../../metabase/scenarios/dashboard/helpers/e2e-filter-helpers";

const questionParams = {
  name: "14473",
  native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
};

describe("visual tests > dashboard", () => {
  describe("edit", () => {
    describe("filter", () => {
      cy.createNativeQuestion(questionParams).then(
        ({ body: { id: questionId } }) => {
          cy.createDashboard("14473D").then(({ body: { id: dashboardId } }) => {
            cy.log("Add 4 filters to the dashboard");

            addFiltersToDashboard(dashboardId);

            saveCard(dashboardId, questionId);

            cy.visit(`/dashboard/${dashboardId}`);

            openFilterSidebar();

            cy.findByText("Label");

            cy.percySnapshot();
          });
        },
      );
    });
  });
});

function saveCard(dashboardId, questionId) {
  const url = `/api/dashboard/${dashboardId}/cards`;

  cy.request("POST", url, {
    cardId: questionId,
    sizeX: 10,
    sizeY: 32,
  });
}

function openFilterSidebar() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.findByText("Time").click();
  cy.findByText("Month and Year").click();
}
