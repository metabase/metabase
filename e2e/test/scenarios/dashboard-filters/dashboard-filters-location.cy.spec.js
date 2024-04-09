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
} from "e2e/support/helpers";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_LOCATION_FILTERS } from "./shared/dashboard-filters-location";

describe("scenarios > dashboard > filters > location", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Location", filter);

      cy.findByText("Select…").click();
      popover().contains("City").click();
    });
    saveDashboard();

    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        addWidgetStringFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  it("should work when set as the default filter", () => {
    setFilter("Location", "Is");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("City").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Abbeville");

    saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("1510");
    });
  });
});
