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
  DASHBOARD_SQL_TEXT_FILTERS,
  questionDetails,
} from "./dashboard-filters-sql-text-category";
import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

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
    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      popover().contains(filter).click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter and when that filter is removed (metabase#20493)`, () => {
    setFilter("Text or Category", "Dropdown");

    cy.findByText("Select…").click();
    popover().contains("Dropdown").click();

    cy.findByText("Default value").next().click();

    applyFilterByType("Dropdown", "Gizmo");

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("Rustic Paper Wallet");
    });

    filterWidget().find(".Icon-close").click();

    cy.url().should("not.include", "Gizmo");

    filterWidget().click();

    applyFilterByType("Dropdown", "Doohickey");

    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});

function clearFilter(index) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery2");
}
