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

import { DASHBOARD_SQL_NUMBER_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(
  ([filter, { value, representativeResult, sqlFilter }]) => {
    describe("scenarios > dashboard > filters > SQL > text/category", () => {
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
        setFilter("Number", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Filter")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();
        addWidgetNumberFilter(value);

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        addWidgetNumberFilter(value);

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
    name: "SQL with number filter",
    native: {
      query:
        "select PRODUCTS.TITLE, PRODUCTS.RATING from PRODUCTS where {{filter}} limit 10",
      "template-tags": {
        filter: {
          id: "1c46dd00-3f32-9328-f663-71f98c5d7953",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.RATING, null],
          "widget-type": filter,
        },
      },
    },
  };
}
