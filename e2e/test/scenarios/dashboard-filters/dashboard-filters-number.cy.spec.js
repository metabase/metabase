import { H } from "e2e/support";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_NUMBER_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Number", filter);

      cy.findByText("Select…").click();
      H.popover().contains("Tax").click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_NUMBER_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();
        addWidgetNumberFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.findByText(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  it("should work when set as the default filter", () => {
    H.setFilter("Number", "Equal to");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("2.07");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.findByText("37.65");
    });

    H.clearFilterWidget();

    H.filterWidget().click();

    addWidgetNumberFilter("5.27", { buttonLabel: "Update filter" });

    cy.findByTestId("dashcard").within(() => {
      cy.findByText("101.04");
    });
  });

  it("should support being required", () => {
    H.setFilter("Number", "Equal to", "Equal to");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");

    // Can't save without a default value
    H.toggleRequiredParameter();
    H.dashboardSaveButton().should("be.disabled");
    H.dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Equal to" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    H.dashboardParametersDoneButton().should("be.disabled");
    H.dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    H.sidebar().findByText("Default value").next().click();
    addWidgetNumberFilter("2.07", { buttonLabel: "Update filter" });

    H.saveDashboard();
    H.ensureDashboardCardHasText("37.65");

    // Updates the filter value
    H.setFilterWidgetValue("5.27", "Enter a number");
    H.ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    H.resetFilterWidgetToDefault();
    H.filterWidget().findByText("2.07");
    H.ensureDashboardCardHasText("37.65");

    // Removing value resets back to default
    H.setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    H.filterWidget().findByText("2.07");
    H.ensureDashboardCardHasText("37.65");
  });
});
