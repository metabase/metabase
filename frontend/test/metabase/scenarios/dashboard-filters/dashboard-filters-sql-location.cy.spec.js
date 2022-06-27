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

import { DASHBOARD_SQL_LOCATION_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(
  ([filter, { value, representativeResult, sqlFilter }]) => {
    describe("scenarios > dashboard > filters > location", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        const questionDetails = getQuestionDetails(sqlFilter);

        cy.createNativeQuestionAndDashboard({ questionDetails }).then(
          ({ body: { card_id, dashboard_id } }) => {
            visitQuestion(card_id);

            visitDashboard(dashboard_id);
          },
        );

        editDashboard();
        setFilter("Location", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Filter")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();
        addWidgetStringFilter(value);

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        addWidgetStringFilter(value);

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
        "select PEOPLE.NAME, PEOPLE.CITY from people where {{filter}} limit 10",
      "template-tags": {
        filter: {
          id: "0388fcd0-55cd-ca2a-5113-1bbceafc6047",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PEOPLE.CITY, null],
          "widget-type": filter,
        },
      },
    },
  };
}
