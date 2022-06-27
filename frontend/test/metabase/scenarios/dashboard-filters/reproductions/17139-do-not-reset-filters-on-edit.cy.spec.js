import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  cancelEditingDashboard,
  saveDashboard,
  checkFilterLabelAndValue,
  visitDashboard,
} from "__support__/e2e/helpers";

import { setMonthAndYear } from "../../native-filters/helpers/e2e-date-filter-helpers";

describe("issue 17139", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitDashboard(1);

    editDashboard();

    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("What do you want to filter?");
      cy.findByText("Time").click();
      cy.findByText("Month and Year").click();
    });

    cy.findByText("Select…").click();
    popover()
      .contains("Created At")
      .first()
      .click();

    saveDashboard();
  });

  it("should not reset previously defined filters when exiting 'edit' mode without making any changes (metabase#5332, metabase#17139)", () => {
    filterWidget()
      .contains("Month and Year")
      .click();

    setMonthAndYear({ month: "November", year: "2016" });

    cy.url().should("contain", "?month_and_year=2016-11");
    checkFilterLabelAndValue("Month and Year", "November, 2016");

    editDashboard();
    cancelEditingDashboard();

    cy.url().should("contain", "?month_and_year=2016-11");
    checkFilterLabelAndValue("Month and Year", "November, 2016");
  });
});
