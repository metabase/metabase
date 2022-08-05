import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

import { DASHBOARD_LOCATION_FILTERS } from "./dashboard-filters-location";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

describe("scenarios > dashboard > filters > location", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(1);

    editDashboard();
  });

  it(`should work when set through the filter widget`, () => {
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
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Location", "Dropdown");
    cy.findByText("Select…").click();
    popover().contains("City").click();

    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Abbeville");

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("1510");
    });
  });
});

function clearFilter(index = 0) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery1");
}
