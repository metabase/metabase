import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitQuestion,
} from "__support__/e2e/cypress";

import { DASHBOARD_SQL_DATE_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

Object.entries(DASHBOARD_SQL_DATE_FILTERS).forEach(
  ([filter, { value, representativeResult, sqlFilter }]) => {
    describe("scenarios > dashboard > filters > SQL > date", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        const questionDetails = getQuestionDetails(sqlFilter);

        cy.createNativeQuestionAndDashboard({ questionDetails }).then(
          ({ body: { card_id, dashboard_id } }) => {
            visitQuestion(card_id);

            cy.visit(`/dashboard/${dashboard_id}`);
          },
        );

        editDashboard();
        setFilter("Time", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Filter")
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
          cy.contains(representativeResult);
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
          cy.contains(representativeResult);
        });
      });
    });
  },
);

function getQuestionDetails(filter) {
  return {
    name: "SQL with Field Filter",
    native: {
      query:
        "select PEOPLE.NAME, PEOPLE.CREATED_AT from people where {{filter}} limit 10",
      "template-tags": {
        filter: {
          id: "7136f057-cfa6-e6fb-40c1-02046a1df9fb",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PEOPLE.CREATED_AT, null],
          "widget-type": filter,
        },
      },
    },
  };
}

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
