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

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";
import {
  DASHBOARD_SQL_LOCATION_FILTERS,
  questionDetails,
} from "./dashboard-filters-sql-location";

describe("scenarios > dashboard > filters > location", () => {
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

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilter(index);
      },
    );
  });

  it(`should work when set as the default filter`, () => {
    setFilter("Location", "Dropdown");

    cy.findByText("Select…").click();
    popover().contains("Dropdown").click();

    cy.findByText("Default value").next().click();

    addWidgetStringFilter("Rye");

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("Arnold Adams");
    });

    filterWidget().find(".Icon-close").click();

    cy.url().should("not.include", "Rye");

    filterWidget().click();

    addWidgetStringFilter("Pittsburg");

    cy.get(".Card").within(() => {
      cy.contains("Aracely Jenkins");
    });
  });
});

function clearFilter(index) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery2");
}
