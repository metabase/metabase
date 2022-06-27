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

import { DASHBOARD_SQL_TEXT_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
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
        setFilter("Text or Category", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Filter")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();
        applyFilterByType(filter, value);

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter and when that filter is removed (metabase#20493)`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        applyFilterByType(filter, value);

        saveDashboard();

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        filterWidget()
          .find(".Icon-close")
          .click();

        cy.url().should("not.include", value);

        cy.findByText("Rustic Paper Wallet");
      });
    });
  },
);

function getQuestionDetails(filter) {
  return {
    name: "SQL with Field Filter",
    native: {
      query: "select * from PRODUCTS where {{filter}}",
      "template-tags": {
        filter: {
          id: "e05b9e58-3c51-676d-7334-4c2543709094",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.CATEGORY, null],
          "widget-type": filter,
        },
      },
    },
  };
}
