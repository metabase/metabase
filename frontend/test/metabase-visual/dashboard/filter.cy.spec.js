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

  describe("edit", () => {
    describe("filter", () => {
      it("shows filter sidebar", () => {
        cy.createNativeQuestion(questionParams).then(
          ({ body: { id: questionId } }) => {
            cy.createDashboard("14473D").then(
              ({ body: { id: dashboardId } }) => {
                cy.log("Add 4 filters to the dashboard");

                addFiltersToDashboard(dashboardId);

                saveCard(dashboardId, questionId);

                cy.visit(`/dashboard/${dashboardId}`);

                openFilterSidebar();

                cy.findByText("Label");

                cy.percySnapshot(
                  "Shows dashboard filter sidebar " + Date.now(),
                );
              },
            );
          },
        );
      });
    });
  });
});

function openFilterSidebar() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.findByText("Time").click();
  cy.findByText("Month and Year").click();
}
