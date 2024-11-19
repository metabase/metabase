import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  clearFilterWidget,
  dashboardParametersDoneButton,
  dashboardSaveButton,
  editDashboard,
  ensureDashboardCardHasText,
  filterWidget,
  popover,
  resetFilterWidgetToDefault,
  restore,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  setFilterWidgetValue,
  sidebar,
  toggleRequiredParameter,
  visitDashboard,
} from "e2e/support/helpers";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    restore();
    cy.signInAsAdmin();

    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();

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

  it("should work when set through the filter widget", () => {
    DASHBOARD_NUMBER_FILTERS.forEach(({ operator, single }) => {
      cy.log(`Make sure we can connect ${operator} filter`);
      setFilter("Number", operator);

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      popover().contains("Tax").click();
    });

    saveDashboard();
    cy.wait("@dashboardData");

    DASHBOARD_NUMBER_FILTERS.forEach(
      ({ operator, value, representativeResult }, index) => {
        filterWidget().eq(index).click();
        addWidgetNumberFilter(value);
        cy.wait("@dashboardData");

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard").should("contain", representativeResult);

        clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );
  });

  it("should work when set as the default filter", () => {
    setFilter("Number", "Equal to");
    selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("2.07");

    saveDashboard();
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "37.65")
      .and("not.contain", "101.04");

    clearFilterWidget();
    cy.wait("@dashboardData");

    filterWidget().click();
    addWidgetNumberFilter("5.27", { buttonLabel: "Update filter" });
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "101.04")
      .and("not.contain", "37.65");
  });

  it("should support being required", () => {
    setFilter("Number", "Equal to", "Equal to");
    selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");

    // Can't save without a default value
    toggleRequiredParameter();
    dashboardSaveButton().should("be.disabled");
    dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Equal to" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    dashboardParametersDoneButton().should("be.disabled");
    dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    sidebar().findByText("Default value").next().click();
    addWidgetNumberFilter("2.07", { buttonLabel: "Update filter" });

    saveDashboard();
    cy.wait("@dashboardData");
    ensureDashboardCardHasText("37.65");

    // Updates the filter value
    setFilterWidgetValue("5.27", "Enter a number");
    cy.wait("@dashboardData");
    ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    resetFilterWidgetToDefault();
    filterWidget().findByText("2.07");
    cy.wait("@dashboardData");
    ensureDashboardCardHasText("37.65");

    // Removing value resets back to default
    setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    filterWidget().findByText("2.07");
    ensureDashboardCardHasText("37.65");
  });
});
