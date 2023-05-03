import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitQuestion,
  visitDashboard,
} from "e2e/support/helpers";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";
import {
  DASHBOARD_SQL_NUMBER_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-number";

describe("scenarios > dashboard > filters > SQL > text/category", () => {
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
    Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);

      setFilter("Number", filter);

      cy.findByText("Select…").click();
      popover().contains(filter).click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        addWidgetNumberFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Number", "Equal to");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetNumberFilter("3.8");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Equal to").click();

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("Small Marble Hat");
      cy.contains("Rustic Paper Wallet").should("not.exist");
    });

    filterWidget().find(".Icon-close").click();

    filterWidget().click();

    addWidgetNumberFilter("4.6");

    cy.get(".Card").within(() => {
      cy.findByText("Ergonomic Linen Toucan");
      cy.contains("Small Marble Hat").should("not.exist");
    });
  });
});

function clearFilter(index) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery2");
}
