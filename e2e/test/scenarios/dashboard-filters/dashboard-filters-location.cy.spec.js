import { H } from "e2e/support";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_LOCATION_FILTERS } from "./shared/dashboard-filters-location";

describe("scenarios > dashboard > filters > location", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Location", filter);

      cy.findByText("Select…").click();
      H.popover().contains("City").click();
    });
    H.saveDashboard();

    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();
        addWidgetStringFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  it("should work when set as the default filter", () => {
    H.setFilter("Location", "Is");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("City").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Abbeville");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("1510");
    });
  });
});
