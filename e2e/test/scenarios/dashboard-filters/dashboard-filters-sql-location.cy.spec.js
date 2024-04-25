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
    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(([filter]) => {
      setFilter("Location", filter);

      cy.findByText("Select…").click();
      popover().contains(filter).click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_SQL_LOCATION_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        addWidgetStringFilter(value);

        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter", () => {
    setFilter("Location", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Is").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Rye");

    saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Arnold Adams");
    });

    clearFilterWidget();

    cy.url().should("not.include", "Rye");

    filterWidget().click();

    addWidgetStringFilter("Pittsburg", { buttonLabel: "Update filter" });

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Aracely Jenkins");
    });
  });
});
