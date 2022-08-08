import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitQuestion,
  visitDashboard,
} from "__support__/e2e/helpers";

import {
  DASHBOARD_SQL_DATE_FILTERS,
  questionDetails,
} from "./dashboard-filters-sql-date";
import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

describe("scenarios > dashboard > filters > SQL > date", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        visitQuestion(card_id);

        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
  });

  it(`should work when set through the filter widget`, () => {
    Object.entries(DASHBOARD_SQL_DATE_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Time", filter);

      cy.findByText("Select…").click();
      popover().contains(filter).click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_SQL_DATE_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Time", "Month and Year");

    cy.findByText("Default value").next().click();
    DateFilter.setMonthAndYear({
      month: "October",
      year: "2017",
    });

    cy.findByText("Select…").click();
    popover().contains("Month and Year").click();
    saveDashboard();

    // The default value should immediately be applied
    cy.get(".Card").within(() => {
      cy.contains("Hudson Borer");
    });

    // Make sure we can override the default value
    cy.findByText("October, 2017").click();
    popover().contains("August").click();
    cy.findByText("Oda Brakus");
  });
});

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
      cy.findByText("Update filter").click();
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      cy.findByText("Update filter").click();
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

function clearFilter(index) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery2");
}
