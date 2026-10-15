const { H } = cy;
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  addWidgetStringFilter,
  selectFilterValueFromList,
} from "../native/helpers/e2e-field-filter-helpers";

import { DASHBOARD_LOCATION_FILTERS } from "./shared/dashboard-filters-location";

describe("scenarios > dashboard > filters > location", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
  });

  it("should work when set through the filter widget or as the default filter", () => {
    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(([filter], index) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Location", filter);

      cy.findByText("Select…").click();
      H.popover().contains("City").click();

      if (index === 0) {
        cy.findByText("Default value").next().click();
        selectFilterValueFromList(DASHBOARD_LOCATION_FILTERS[filter].value);
      }
    });
    H.saveDashboard();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    cy.log("Make sure the default filter value is applied");
    cy.findByTestId("dashcard")
      .should("contain", DASHBOARD_LOCATION_FILTERS.Is.representativeResult)
      .and("not.contain", "39.72");
    H.clearFilterWidget(0);
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
    cy.findByTestId("dashcard").should("contain", "39.72");

    Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();
        // The "Is" value matches its default, so the widget offers "Set to default"
        addWidgetStringFilter(value, {
          buttonLabel: index === 0 ? "Set to default" : "Add filter",
        });
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", "39.72");

        H.clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });
});
