const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

import { addWidgetNumberFilter } from "../native/helpers/e2e-field-filter-helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
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

  it("should support being required, and work when set through the filter widget", () => {
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
    assertDefaultTaxApplied();

    // Updates the filter value
    H.setFilterWidgetValue("5.27", "Enter a number");
    cy.wait("@dashboardData");
    H.ensureDashboardCardHasText("95.77");

    // Resets the value back by clicking widget icon
    H.resetFilterWidgetToDefault();
    H.filterWidget().findByText("2.07");
    cy.wait("@dashboardData");
    assertDefaultTaxApplied();

    // Removing value resets back to default
    H.setFilterWidgetValue("5.27", "Enter a number");
    cy.wait("@dashboardData");
    H.ensureDashboardCardHasText("95.77");
    H.setFilterWidgetValue(null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    cy.wait("@dashboardData");
    H.filterWidget().findByText("2.07");
    assertDefaultTaxApplied();

    cy.log("remove the required filter");
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    H.sidebar().findByRole("button", { name: "Remove" }).click();

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

    H.setFilter("Number", "Between");
    H.selectDashboardFilter(H.getDashboardCard(), "Total");

    H.saveDashboard();
    cy.wait("@dashboardData");

    DASHBOARD_NUMBER_FILTERS.forEach(
      ({ operator, value, representativeResult, negativeAssertion }, index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();
        addWidgetNumberFilter(value);
        cy.wait("@dashboardData");

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", negativeAssertion);

        H.clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );

    cy.log("Between filters work without min or max (metabase#54364)");
    const betweenIndex = DASHBOARD_NUMBER_FILTERS.length;
    const getInput = (index) =>
      cy
        .findAllByPlaceholderText("Enter a number")
        .should("have.length", 2)
        .eq(index);
    const getMinInput = () => getInput(0);
    const getMaxInput = () => getInput(1);

    cy.log("min only");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.filterWidget().eq(betweenIndex).click();
    H.popover().within(() => {
      getMinInput().type("150");
      cy.button("Add filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(256));

    cy.log("max only");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.filterWidget().eq(betweenIndex).click();
    H.popover().within(() => {
      getMinInput().clear();
      getMaxInput().type("20");
      cy.button("Update filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(52));

    cy.log("min and max");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.filterWidget().eq(betweenIndex).click();
    H.popover().within(() => {
      getMinInput().clear().type("150");
      getMaxInput().clear().type("155");
      cy.button("Update filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(166));
  });
});

function assertDefaultTaxApplied() {
  cy.findByTestId("dashcard")
    .should("contain", "37.65")
    .and("not.contain", "110.93")
    .and("not.contain", "95.77");
}
