import {
  restore,
  popover,
  clearFilterWidget,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitQuestion,
  visitDashboard,
} from "e2e/support/helpers";

import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  DASHBOARD_SQL_TEXT_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-text-category";

describe("scenarios > dashboard > filters > SQL > text/category", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

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

  it("should work when set through the filter widget", () => {
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
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter and when that filter is removed (metabase#20493)", () => {
    setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Gizmo");

    saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Rustic Paper Wallet");
    });

    clearFilterWidget();

    cy.url().should("not.include", "Gizmo");

    filterWidget().click();

    applyFilterByType("Is", "Doohickey", { buttonLabel: "Update filter" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});
