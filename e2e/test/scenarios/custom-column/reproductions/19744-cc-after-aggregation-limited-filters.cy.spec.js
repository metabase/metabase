import {
  restore,
  editDashboard,
  visitQuestionAdhoc,
  popover,
  visitDashboard,
  addOrUpdateDashboardCard,
  getDashboardCard,
  saveDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", PRODUCTS.PRICE, null]],
          ["sum", ["field", PRODUCTS.RATING, null]],
        ],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      expressions: { Math: ["+", 1, 1] },
    },
    database: SAMPLE_DB_ID,
  },
  display: "bar",
};

describe("issue 19744", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // For this specific repro, it's crucial to first visit the question in order to load the `results_metadata`...
    visitQuestionAdhoc(questionDetails);
    // ...and then to save it using the UI
    saveQuestion("19744");

    addQuestionToDashboardAndVisit();
  });

  it("custom column after aggregation shouldn't limit or change the behavior of dashboard filters (metabase#19744)", () => {
    editDashboard();
    cy.icon("filter").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    getDashboardCard().findByText("Select…").click();
    popover().findByText("Created At").click();
    saveDashboard();

    cy.findByText("Date Filter").click();
    popover().within(() => {
      cy.findByText("Specific dates...").click();
    });
    popover().within(() => {
      cy.findByText("On").click();
      cy.findByRole("textbox").clear().type("05/26/2018");
      cy.button("Update filter").click();
    });
    cy.get(".bar").should("have.length", 1);
  });
});

function saveQuestion(name) {
  cy.intercept("POST", "/api/card").as("saveQuestion");

  cy.findByText("Save").click();
  cy.findByLabelText("Name").type(name);

  cy.get(".Modal").button("Save").click();

  cy.findByText("Not now").click();

  cy.wait("@saveQuestion").then(({ response: { body } }) => {
    cy.wrap(body.id).as("questionId");
  });
}

function addQuestionToDashboardAndVisit() {
  cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
    cy.get("@questionId").then(card_id => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: { size_x: 16, size_y: 10 },
      });
    });

    visitDashboard(dashboard_id);
  });
}
