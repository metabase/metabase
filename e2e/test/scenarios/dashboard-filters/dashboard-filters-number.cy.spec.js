const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();

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
      H.setFilter("Number", operator);

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      H.popover().contains("Tax").click();
    });

    H.saveDashboard();
    cy.wait("@dashboardData");

    DASHBOARD_NUMBER_FILTERS.forEach(
      ({ operator, value, representativeResult }, index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();
        addWidgetNumberFilter(value);
        cy.wait("@dashboardData");

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard").should("contain", representativeResult);

        H.clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );
  });

  it("should work when set as the default filter", () => {
    H.setFilter("Number", "Equal to");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("2.07");

    H.saveDashboard();
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "37.65")
      .and("not.contain", "101.04");

    H.clearFilterWidget();
    cy.wait("@dashboardData");

    H.filterWidget().click();
    addWidgetNumberFilter("5.27", { buttonLabel: "Update filter" });
    cy.wait("@dashboardData");

    cy.findByTestId("dashcard")
      .should("contain", "101.04")
      .and("not.contain", "37.65");
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
    cy.wait("@dashboardData");
    H.ensureDashboardCardHasText("37.65");

    // Updates the filter value
    H.setFilterWidgetValue("5.27", "Enter a number");
    cy.wait("@dashboardData");
    H.ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    H.resetFilterWidgetToDefault();
    H.filterWidget().findByText("2.07");
    cy.wait("@dashboardData");
    H.ensureDashboardCardHasText("37.65");

    // Removing value resets back to default
    H.setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    H.filterWidget().findByText("2.07");
    H.ensureDashboardCardHasText("37.65");
  });

  it("should allow between filters without min or max (metabase#54364)", () => {
    const getInput = (index) =>
      cy
        .findAllByPlaceholderText("Enter a number")
        .should("have.length", 2)
        .eq(index);

    const getMinInput = () => getInput(0);
    const getMaxInput = () => getInput(1);

    H.setFilter("Number", "Between");
    H.selectDashboardFilter(H.getDashboardCard(), "Total");
    H.saveDashboard();

    cy.log("min only");
    H.filterWidget().click();
    H.popover().within(() => {
      getMinInput().type("150");
      cy.button("Add filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(256));

    cy.log("max only");
    H.filterWidget().click();
    H.popover().within(() => {
      getMinInput().clear();
      getMaxInput().type("20");
      cy.button("Update filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(52));

    cy.log("min and max only");
    H.filterWidget().click();
    H.popover().within(() => {
      getMinInput().clear().type("150");
      getMaxInput().clear().type("155");
      cy.button("Update filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(166));
  });
});
