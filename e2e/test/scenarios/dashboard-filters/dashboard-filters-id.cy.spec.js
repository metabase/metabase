import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  checkFilterLabelAndValue,
  editDashboard,
  filterWidget,
  popover,
  restore,
  saveDashboard,
  setFilter,
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

    /**
     * Even though we're already intercepting this route in the visitDashboard helper,
     * it is important to alias it differently here, and to then wait for it in tests.
     *
     * The place where the intercept is first set matters.
     * If we set it before the visitDashboard, we'd have to wait for it after the visit,
     * otherwise we'd always be one wait behind in tests.
     */
    cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query").as(
      "dashboardData",
    );
  });

  describe("should work for the primary key", () => {
    beforeEach(() => {
      popover().contains("ID").first().click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();
      cy.wait("@dashboardData");

      filterWidget().click();
      addWidgetStringFilter("15");
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "114.42");
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("15");

      saveDashboard();
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "114.42");
    });
  });

  describe("should work for the foreign key", () => {
    beforeEach(() => {
      popover().contains("User ID").click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();
      cy.wait("@dashboardData");

      filterWidget().click();
      addWidgetStringFilter("4");
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "47.68");
      checkFilterLabelAndValue("ID", "Arnold Adams - 4");
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("4");

      saveDashboard();
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "47.68");
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
      cy.wait("@dashboardData");

      filterWidget().click();
      addWidgetStringFilter("10");
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "6.75");
    });

    it("when set as the default filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Default value").next().click();
      addWidgetStringFilter("10");

      saveDashboard();
      cy.wait("@dashboardData");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("dashcard").should("contain", "6.75");
    });
  });
});
