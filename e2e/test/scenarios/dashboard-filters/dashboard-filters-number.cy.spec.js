import {
  ORDERS_DASHBOARD_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  clearFilterWidget,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
  selectDashboardFilter,
  toggleRequiredParameter,
  setFilterWidgetValue,
  resetFilterWidgetToDefault,
  dashboardSaveButton,
  ensureDashboardCardHasText,
  sidebar,
  dashboardParametersDoneButton,
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
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_NUMBER_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Number", filter);

      cy.findByText("Select…").click();
      popover().contains("Tax").click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_NUMBER_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        addWidgetNumberFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
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

    cy.get(".Card").within(() => {
      cy.findByText("37.65");
    });

    clearFilterWidget();

    filterWidget().click();

    addWidgetNumberFilter("5.27", { buttonLabel: "Update filter" });

    cy.get(".Card").within(() => {
      cy.findByText("101.04");
    });
  });

  it("should support being required", () => {
    setFilter("Number", "Equal to");
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
    ensureDashboardCardHasText("37.65");

    // Updates the filter value
    setFilterWidgetValue("5.27", "Enter a number");
    ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    resetFilterWidgetToDefault();
    filterWidget().findByText("2.07");
    ensureDashboardCardHasText("37.65");

    // Removing value resets back to default
    setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    filterWidget().findByText("2.07");
    ensureDashboardCardHasText("37.65");
  });
});
