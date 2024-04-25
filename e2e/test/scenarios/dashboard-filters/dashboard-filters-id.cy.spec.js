import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  checkFilterLabelAndValue,
  visitDashboard,
} from "e2e/support/helpers";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

describe("scenarios > dashboard > filters > ID", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();
    setFilter("ID");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
  });
  describe("should work for the primary key", () => {
    beforeEach(() => {
      popover().contains("ID").first().click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("15");
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("114.42");
      });
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("15");

      saveDashboard();
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("114.42");
      });
    });
  });

  describe("should work for the foreign key", () => {
    beforeEach(() => {
      popover().contains("User ID").click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("4");
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("47.68");
      });

      checkFilterLabelAndValue("ID", "Arnold Adams - 4");
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("4");

      saveDashboard();
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("47.68");
      });

      checkFilterLabelAndValue("ID", "Arnold Adams - 4");
    });
  });

  describe("should work on the implicit join", () => {
    beforeEach(() => {
      popover().within(() => {
        // There are three of these, and the order is fixed:
        // "own" column first, then implicit join on People and User alphabetically.
        // We select index 1 to get the Product.ID.
        cy.findAllByText("ID").eq(1).click();
      });
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("10");
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("6.75");
      });
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("10");

      saveDashboard();
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findByTestId("dashcard").within(() => {
        cy.findByText("6.75");
      });
    });
  });
});
