import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "e2e/support/helpers";

import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";
import { DASHBOARD_TEXT_FILTERS } from "./shared/dashboard-filters-text-category";

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

  it(`should work when set as the default filter which (if cleared) should not be preserved on reload (metabase#13960)`, () => {
    setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Source").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Organic");

    // We need to add another filter only to reproduce metabase#13960
    setFilter("ID");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("User ID").click();

    saveDashboard();
    cy.wait("@dashcardQuery1");

    cy.location("search").should("eq", "?text=Organic");
    cy.get(".Card").within(() => {
      cy.contains("39.58");
    });

    // This part reproduces metabase#13960
    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();
    cy.wait("@dashcardQuery1");

    cy.location("search").should("eq", "?text=");

    filterWidget().contains("ID").click();
    cy.findByPlaceholderText("Enter an ID").type("4{enter}").blur();
    cy.button("Add filter").click();
    cy.wait("@dashcardQuery1");

    cy.location("search").should("eq", "?text=&id=4");

    cy.reload();
    cy.wait("@dashcardQuery1");

    cy.location("search").should("eq", "?text=&id=4");
    filterWidget().contains("Text");
    filterWidget().contains("Arnold Adams");
  });
});

function clearFilter(index = 0) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery1");
}
