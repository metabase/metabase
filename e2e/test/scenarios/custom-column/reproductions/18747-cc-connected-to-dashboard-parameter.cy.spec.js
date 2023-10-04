import { restore, popover, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "18747",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      ["Quantity_2"]: ["field", ORDERS.QUANTITY, null],
    },
  },
};

describe("issue 18747", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
            },
          ],
        }).then(() => {
          visitDashboard(dashboard_id);
        });
      },
    );
  });

  it("should correctly filter the table with a number parameter mapped to the custom column Quantity_2", () => {
    addNumberParameterToDashboard();
    mapParameterToCustomColumn();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // wait for saving to finish
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("You're editing this dashboard.").should("not.exist");

    addValueToParameterFilter();

    cy.get(".CardVisualization tbody > tr").should("have.length", 1);

    // check that the parameter value is parsed correctly on page load
    cy.reload();
    cy.get(".LoadingSpinner").should("not.exist");

    cy.get(".CardVisualization tbody > tr").should("have.length", 1);
  });
});

function addNumberParameterToDashboard() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.contains("Number").click();
  cy.findByText("Equal to").click();
}

function mapParameterToCustomColumn() {
  cy.get(".DashCard").contains("Select…").click();
  popover().contains("Quantity_2").click({ force: true });
}

function addValueToParameterFilter() {
  cy.contains("Equal to").click();
  popover().find("input").type("14");
  popover().contains("Add filter").click();
}
