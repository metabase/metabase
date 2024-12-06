import { H } from "e2e/support";

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

    H.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        H.visitQuestion(card_id);

        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      H.popover().contains(filter).click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter and when that filter is removed (metabase#20493)", () => {
    H.setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Gizmo");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Rustic Paper Wallet");
    });

    H.clearFilterWidget();

    cy.url().should("not.include", "Gizmo");

    H.filterWidget().click();

    applyFilterByType("Is", "Doohickey", { buttonLabel: "Update filter" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});
