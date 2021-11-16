import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
} from "__support__/e2e/cypress";

import { DASHBOARD_SQL_TEXT_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
  ([filter, { value, representativeResult, sqlFilter }]) => {
    describe("scenarios > dashboard > filters > SQL > text/category", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        mockSessionProperty("field-filter-operators-enabled?", true);

        const questionDetails = getQuestionDetails(sqlFilter);

        cy.createNativeQuestionAndDashboard({ questionDetails }).then(
          ({ body: { id, card_id, dashboard_id } }) => {
            cy.intercept(
              "POST",
              `/api/dashboard/${dashboard_id}/card/${card_id}/query`,
            ).as("cardQuery");
            cy.visit(`/question/${card_id}`);

            // Wait for `result_metadata` to load
            cy.wait("@cardQuery");

            cy.visit(`/dashboard/${dashboard_id}`);
          },
        );

        editDashboard();
        setFilter("Text or Category", filter);

        cy.findByText("Column to filter on")
          .next("a")
          .click();

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
