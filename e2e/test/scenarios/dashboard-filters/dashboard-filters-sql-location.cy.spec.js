import { H } from "e2e/support";

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
    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(([filter]) => {
      H.setFilter("Location", filter);

      cy.findByText("Select…").click();
      H.popover().contains(filter).click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();
        addWidgetStringFilter(value);

        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter", () => {
    H.setFilter("Location", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Rye");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Arnold Adams");
    });

    H.clearFilterWidget();

    cy.url().should("not.include", "Rye");

    H.filterWidget().click();

    addWidgetStringFilter("Pittsburg", { buttonLabel: "Update filter" });

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Aracely Jenkins");
    });
  });
});
