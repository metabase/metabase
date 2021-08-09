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

  describe("shows dashboard in fullscreen mode", () => {
    it("renders in day mode", () => {
      cy.createNativeQuestion(questionParams).then(
        ({ body: { id: questionId } }) => {
          cy.createDashboard("14473D").then(({ body: { id: dashboardId } }) => {
            cy.log("Add 4 filters to the dashboard");

            addFiltersToDashboard(dashboardId);

            saveCard(dashboardId, questionId);

            cy.visit(`/dashboard/${dashboardId}`);

            cy.icon("expand").click();

            cy.icon("moon");

            cy.percySnapshot(
              "Shows dashboard in fullscreen day mode" + Date.now(),
            );
          });
        },
      );
    });

    it("renders in night mode", () => {
      cy.createNativeQuestion(questionParams).then(
        ({ body: { id: questionId } }) => {
          cy.createDashboard("14473D").then(({ body: { id: dashboardId } }) => {
            cy.log("Add 4 filters to the dashboard");

            addFiltersToDashboard(dashboardId);

            saveCard(dashboardId, questionId);

            cy.visit(`/dashboard/${dashboardId}`);

            cy.icon("expand").click();

            cy.icon("moon").click();

            cy.icon("sun");

            cy.percySnapshot(
              "Shows dashboard in fullscreen night mode" + Date.now(),
            );
          });
        },
      );
    });
  });
});
