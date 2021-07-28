import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
} from "__support__/e2e/cypress";

import { DASHBOARD_DATE_FILTERS } from "./helpers/e2e-dashboard-filter-data-objects";
import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

Object.entries(DASHBOARD_DATE_FILTERS).forEach(
  ([filter, { value, representativeResult }]) => {
    describe("scenarios > dashboard > filters > date", () => {
      beforeEach(() => {
        cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

        restore();
        cy.signInAsAdmin();

        mockSessionProperty("field-filter-operators-enabled?", true);

        cy.visit("/dashboard/1");

        editDashboard();
        setFilter("Time", filter);

        cy.findByText("Column to filter on")
          .next("a")
          .click();

        popover()
          .contains("Created At")
          .first()
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();

        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });

        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });

        saveDashboard();

        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });
      });
    });
  },
);

function dateFilterSelector({ filterType, filterValue } = {}) {
  switch (filterType) {
    case "Month and Year":
      DateFilter.setMonthAndYear(filterValue);
      break;

    case "Quarter and Year":
      DateFilter.setQuarterAndYear(filterValue);
      break;

    case "Single Date":
      DateFilter.setSingleDate(filterValue);
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      break;

    case "Relative Date":
      DateFilter.setRelativeDate(filterValue);
      break;

    case "All Options":
      DateFilter.setAdHocFilter(filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
