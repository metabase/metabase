import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

const { ORDERS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > SQL > ID", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("should work for the primary key", () => {
    beforeEach(() => {
      prepareDashboardWithFilterConnectedTo(ORDERS.ID);
    });

    it("when set through the filter widget", () => {
      H.saveDashboard();

      H.filterWidget().click();
      addWidgetStringFilter("15");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("114.42");
      });
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("15");

      H.saveDashboard();

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("114.42");
      });
    });
  });

  describe("should work for the foreign key", () => {
    beforeEach(() => {
      prepareDashboardWithFilterConnectedTo(ORDERS.USER_ID);
    });

    it("when set through the filter widget", () => {
      H.saveDashboard();

      H.filterWidget().click();
      addWidgetStringFilter("4");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("47.68");
      });
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("4");

      H.saveDashboard();

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("47.68");
      });
    });
  });
});

function prepareDashboardWithFilterConnectedTo(rowId) {
  const questionDetails = {
    name: "SQL with ID filter",
    native: {
      query: "select * from ORDERS where {{filter}}",
      "template-tags": {
        filter: {
          id: "3ff86eea-2559-5ab7-af10-e532a54661c5",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", rowId, null],
          "widget-type": "id",
          default: null,
        },
      },
    },
  };

  cy.createNativeQuestionAndDashboard({ questionDetails }).then(
    ({ body: { card_id, dashboard_id } }) => {
      H.visitQuestion(card_id);

      H.visitDashboard(dashboard_id);
    },
  );

  H.editDashboard();
  H.setFilter("ID");

  cy.findByText("Select…").click();
  H.popover().contains("Filter").click();
}
