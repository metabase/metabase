import {
  restore,
  popover,
  clearFilterWidget,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitQuestion,
  sidebar,
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

      clickSelect();
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

        clearFilterWidget(index);
        cy.wait("@dashcardQuery2");
      },
    );
  });

  it("should work when set as the default filter", () => {
    setFilter("Number", "Equal to");
    sidebar().findByText("Default value").next().click();

    addWidgetNumberFilter("3.8");

    clickSelect();
    popover().contains("Equal to").click();

    saveDashboard();

    cy.get(".Card").within(() => {
      cy.contains("Small Marble Hat");
      cy.contains("Rustic Paper Wallet").should("not.exist");
    });

    clearFilterWidget();

    filterWidget().click();

    addWidgetNumberFilter("4.6");

    cy.get(".Card").within(() => {
      cy.findByText("Ergonomic Linen Toucan");
      cy.contains("Small Marble Hat").should("not.exist");
    });
  });
});

describe("scenarios > dashboard > filters > SQL > number", () => {
  const questionDetails = {
    name: "Question 1",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] [[ and rating > {{rating}} ]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
        rating: {
          type: "number",
          name: "rating",
          id: "b22a5ce4-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Rating",
        },
      },
    },
  };

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

  it("should keep filter value on blur (metabase#31975)", () => {
    setupNumberFilter("Price");
    setupNumberFilter("Rating");

    saveDashboard();

    cy.findByPlaceholderText("Price").type("95").blur();
    cy.findByPlaceholderText("Rating").type("3.8").blur();

    cy.findAllByTestId("table-row")
      .should("have.length", 2)
      .and("contain", "Doohickey")
      .and("contain", "Widget");
  });
});

function setupNumberFilter(name) {
  setFilter("Number", "Equal to");
  cy.findByDisplayValue("Equal to").clear().type(name);

  clickSelect();
  popover().contains(name).click();
}

function clickSelect() {
  cy.findByTestId("dashcard").findByText("Select…").click();
}
