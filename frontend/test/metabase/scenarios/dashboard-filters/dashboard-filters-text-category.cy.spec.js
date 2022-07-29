import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

import { DASHBOARD_TEXT_FILTERS } from "./dashboard-filters-text-category";
import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

describe("scenarios > dashboard > filters > text/category", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(1);

    editDashboard();
  });

  it(`should work when set through the filter widget`, () => {
    Object.entries(DASHBOARD_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      popover().contains("Source").click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Text or Category", "Dropdown");

    cy.findByText("Select…").click();
    popover().contains("Source").click();

    cy.findByText("Default value").next().click();

    applyFilterByType("Dropdown", "Organic");

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("39.58");
    });
  });
});

function clearFilter(index = 0) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery1");
}
