import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

const { ORDERS } = SAMPLE_DATASET;

describe("scenarios > dashboard > filters > SQL > ID", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    mockSessionProperty("field-filter-operators-enabled?", true);
  });

  describe("should work for the primary key", () => {
    beforeEach(() => {
      prepareDashboardWithFilterConnectedTo(ORDERS.ID);
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("15");

      cy.get(".Card").within(() => {
        cy.findByText("114.42");
      });
    });

    it("when set as the default filter", () => {
      cy.findByText("Default value")
        .next()
        .click();
      addWidgetStringFilter("15");

      saveDashboard();

      cy.get(".Card").within(() => {
        cy.findByText("114.42");
      });
    });
  });

  describe("should work for the foreign key", () => {
    beforeEach(() => {
      prepareDashboardWithFilterConnectedTo(ORDERS.USER_ID);
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("4");

      cy.get(".Card").within(() => {
        cy.findByText("47.68");
      });
    });

    it("when set as the default filter", () => {
      cy.findByText("Default value")
        .next()
        .click();
      addWidgetStringFilter("4");

      saveDashboard();

      cy.get(".Card").within(() => {
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
    ({ body: { id, card_id, dashboard_id } }) => {
      cy.intercept(
        "POST",
        `/api/dashboard/${dashboard_id}/card/${card_id}/query`,
      ).as("cardQuery");
      cy.visit(`/question/${card_id}`);

      // Wait for `result_metadata` to load
      cy.wait("@cardQuery");

      cy.visit(`/dashboard/${dashboard_id}`);
    },
  );

  editDashboard();
  setFilter("ID");

  cy.findByText("Column to filter on")
    .next("a")
    .click();

  popover()
    .contains("Filter")
    .click();
}
