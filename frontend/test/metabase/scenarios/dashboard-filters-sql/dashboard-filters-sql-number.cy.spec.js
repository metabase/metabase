import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
} from "__support__/e2e/cypress";

import { DASHBOARD_SQL_NUMBER_FILTERS } from "./helpers/e2e-dashboard-filter-sql-data-objects";
import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(
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
        setFilter("Number", filter);

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
