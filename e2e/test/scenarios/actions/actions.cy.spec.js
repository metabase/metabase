import {
  dashboardHeader,
  editDashboard,
  restore,
  setActionsEnabledForDB,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

describe("scenarios > actions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not close Action Creator modal on outside click", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);
    addModelDashboard("GUI Dashboard", "dashboardId");
    cy.get("@dashboardId").then(id => {
      cy.visit(`/dashboard/${id}`);
    });
    editDashboard();
    dashboardHeader().within(() => {
      cy.button("Add action").click();
    });
    cy.button("Pick an action").click();
    cy.get(".Modal").within(() => {
      cy.findByText("Action Library")
        .parent()
        .within(() => {
          cy.findByText("GUI Model").click();
          cy.findByText("Create new action").click();
        });
    });
    cy.get("body").click("topLeft");
    cy.get("body").click("bottomRight");

    cy.findByTestId("action-creator-body-container").should("exist");
  });
});

const modelDetails = {
  name: "GUI Model",
  query: { "source-table": PRODUCTS_ID },
  dataset: true,
};

function addModelDashboard(name, alias) {
  return cy
    .createQuestionAndDashboard({
      questionDetails: modelDetails,
      dashboardDetails: { name },
    })
    .then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as(alias);
    });
}
