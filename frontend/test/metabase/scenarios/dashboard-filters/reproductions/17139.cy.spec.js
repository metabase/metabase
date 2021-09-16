import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  cancelEditingDashboard,
  saveDashboard,
  checkFilterLabelAndValue,
} from "__support__/e2e/cypress";

import { setMonthAndYear } from "../../native-filters/helpers/e2e-date-filter-helpers";

describe.skip("issue 17139", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    mockSessionProperty("field-filter-operators-enabled?", true);

    cy.visit("/dashboard/1");

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

  it("should not reset previously defined filters when exiting 'edit' mode without making any changes (metabase#17139)", () => {
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
