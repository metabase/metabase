import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    cy.restore();
    cy.signInAsAdmin();

    cy.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.editDashboard();

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
      cy.setFilter("Number", operator);

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      cy.popover().contains("Tax").click();
    });

    cy.saveDashboard();
    cy.wait("@dashboardData");

    DASHBOARD_NUMBER_FILTERS.forEach(
      ({ operator, value, representativeResult }, index) => {
        cy.filterWidget().eq(index).click();
        addWidgetNumberFilter(value);
        cy.wait("@dashboardData");

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard").should("contain", representativeResult);

        cy.clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );
  });

  it("should work when set as the default filter", () => {
    cy.setFilter("Number", "Equal to");
    cy.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("2.07");

    cy.saveDashboard();
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "37.65")
      .and("not.contain", "101.04");

    cy.clearFilterWidget();
    cy.wait("@dashboardData");

    cy.filterWidget().click();
    addWidgetNumberFilter("5.27", { buttonLabel: "Update filter" });
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "101.04")
      .and("not.contain", "37.65");
  });

  it("should support being required", () => {
    cy.setFilter("Number", "Equal to", "Equal to");
    cy.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");

    // Can't save without a default value
    cy.toggleRequiredParameter();
    cy.dashboardSaveButton().should("be.disabled");
    cy.dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Equal to" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    cy.dashboardParametersDoneButton().should("be.disabled");
    cy.dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    cy.sidebar().findByText("Default value").next().click();
    addWidgetNumberFilter("2.07", { buttonLabel: "Update filter" });

    cy.saveDashboard();
    cy.wait("@dashboardData");
    cy.ensureDashboardCardHasText("37.65");

    // Updates the filter value
    cy.setFilterWidgetValue("5.27", "Enter a number");
    cy.wait("@dashboardData");
    cy.ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    cy.resetFilterWidgetToDefault();
    cy.filterWidget().findByText("2.07");
    cy.wait("@dashboardData");
    cy.ensureDashboardCardHasText("37.65");

    // Removing value resets back to default
    cy.setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    cy.filterWidget().findByText("2.07");
    cy.ensureDashboardCardHasText("37.65");
  });
});
