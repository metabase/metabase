import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  DASHBOARD_SQL_LOCATION_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-location";

describe("scenarios > dashboard > filters > location", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        cy.visitQuestion(card_id);

        cy.visitDashboard(dashboard_id);
      },
    );

    cy.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(([filter]) => {
      cy.setFilter("Location", filter);

      cy.findByText("Select…").click();
      cy.popover().contains(filter).click();
    });

    cy.saveDashboard();

    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        cy.filterWidget().eq(index).click();
        addWidgetStringFilter(value);

        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        cy.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter", () => {
    cy.setFilter("Location", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    cy.popover().contains("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Rye");

    cy.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Arnold Adams");
    });

    cy.clearFilterWidget();

    cy.url().should("not.include", "Rye");

    cy.filterWidget().click();

    addWidgetStringFilter("Pittsburg", { buttonLabel: "Update filter" });

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Aracely Jenkins");
    });
  });
});
