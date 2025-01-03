import { H } from "e2e/support";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  DASHBOARD_SQL_NUMBER_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-number";

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
    Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);

      H.setFilter("Number", filter);

      clickSelect();
      H.popover().contains(filter).click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_SQL_NUMBER_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();
        addWidgetNumberFilter(value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter", () => {
    H.setFilter("Number", "Equal to");
    H.sidebar().findByText("Default value").next().click();

    addWidgetNumberFilter("3.8");

    clickSelect();
    H.popover().contains("Equal to").click();

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Small Marble Hat");
      cy.contains("Rustic Paper Wallet").should("not.exist");
    });

    H.clearFilterWidget();

    H.filterWidget().click();

    addWidgetNumberFilter("4.6", { buttonLabel: "Update filter" });

    cy.findByTestId("dashcard").within(() => {
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
          id: "68821a54-f0f3-4f09-8c32-6f7c0e5e5399",
          "display-name": "Rating",
        },
      },
    },
  };

  const filterDetails = [
    {
      name: "Rating",
      slug: "rating",
      id: "10c0d4ba",
      type: "number/=",
      sectionId: "number",
    },
    {
      name: "Price",
      slug: "price",
      id: "88b1a9dd",
      type: "number/=",
      sectionId: "number",
    },
  ];

  const parameterMapping = filterDetails.map(filter => ({
    parameter_id: filter.id,
    target: ["variable", ["template-tag", filter.slug]],
  }));

  const dashboardDetails = {
    name: "Dashboard #31975",
    parameters: filterDetails,
  };
  const dashcardDetails = {
    row: 0,
    col: 0,
    size_x: 16,
    size_y: 8,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            ...dashcardDetails,
            parameter_mappings: parameterMapping.map(mapping => ({
              ...mapping,
              card_id,
            })),
          },
        ],
      });

      H.visitDashboard(dashboard_id);
    });
  });

  it("should keep filter value on blur (metabase#31975)", () => {
    cy.findByPlaceholderText("Price").type("95").blur();
    cy.findByPlaceholderText("Rating").type("3.8").blur();

    cy.findAllByTestId("table-row")
      .should("have.length", 2)
      // first line price
      .and("contain", "98.82")
      // first line rating
      .and("contain", "4.3")
      // second line price
      .and("contain", "95.93")
      // second line rating
      .and("contain", "4.4");
  });
});

function clickSelect() {
  H.getDashboardCard().findByText("Select…").click();
}
