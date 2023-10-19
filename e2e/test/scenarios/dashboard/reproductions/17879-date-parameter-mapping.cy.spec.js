import {
  editDashboard,
  popover,
  restore,
  saveDashboard,
  showDashboardCardActions,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

describe("issue 17879", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should map dashcard date parameter to correct date range filter in target question - month -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "month",
      expectedFilterText: "Created At between April 1, 2022 April 30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - week -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "week",
      expectedFilterText: "Created At between April 24, 2022 April 30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText:
        "Created At between January 1, 2022 December 31, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> month (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText:
        "Created At between January 1, 2022 December 31, 2022",
      targetDateUnit: "month",
    });
  });
});

function setupDashcardAndDrillToQuestion({
  sourceDateUnit,
  expectedFilterText,
  targetDateUnit = "default",
}) {
  if (targetDateUnit === "default") {
    cy.createQuestion({
      name: "Q1 - 17879",
      query: {
        "source-table": ORDERS_ID,
        limit: 3,
      },
    });
  } else {
    cy.createQuestion({
      name: "Q1 - 17879",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": targetDateUnit }],
        ],
        limit: 3,
      },
    });
  }

  cy.createDashboardWithQuestions({
    dashboardName: "Dashboard with aggregated Q2",
    questions: [
      {
        name: "Q2",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
          ],
          limit: 5,
        },
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
          "graph.show_values": true,
        },
      },
    ],
  }).then(({ dashboard }) => {
    cy.intercept(
      "POST",
      `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`,
    ).as("getCardQuery");

    visitDashboard(dashboard.id);
    editDashboard(dashboard.id);

    showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });

    cy.findByText("Go to a custom destination").click();
    cy.findByText("Saved question").click();
    cy.findByText("Q1 - 17879").click();
    cy.findByText("Orders → Created At").click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    sidebar().within(() => {
      cy.findByText("Done").click();
    });

    saveDashboard();

    cy.wait("@getCardQuery");

    cy.findByTestId("visualization-root").within(() => {
      cy.get("circle").first().click({ force: true });
    });

    cy.url().should("include", `/question`);

    cy.findByTestId("qb-filters-panel").should("have.text", expectedFilterText);
  });
}
