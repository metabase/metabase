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

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";
import { DASHBOARD_NUMBER_FILTERS } from "./shared/dashboard-filters-number";

describe("scenarios > dashboard > filters > number", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    restore();
    cy.signInAsAdmin();

    visitDashboard(1);

    editDashboard();
  });

  it(`should work when set through the filter widget`, () => {
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

        console.log(cy.state());
        clearFilterWidget(index);
        cy.wait("@dashcardQuery1");
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Number", "Equal to");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("2.07");

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.findByText("37.65");
    });

    clearFilterWidget();

    filterWidget().click();

    addWidgetNumberFilter("5.27");

    cy.get(".Card").within(() => {
      cy.findByText("101.04");
    });
  });
});
