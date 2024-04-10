import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  lineChartCircle,
  popover,
  restore,
  saveDashboard,
  showDashboardCardActions,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

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
      expectedFilterText: "Created At is Apr 1–30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - week -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "week",
      expectedFilterText: "Created At is Apr 24–30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> month (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2022",
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
        limit: 5,
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
        limit: 5,
      },
    });
  }

  cy.createDashboardWithQuestions({
    dashboardName: "Dashboard with aggregated Q2",
    questions: [
      {
        name: "Q2",
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
          ],
          limit: 5,
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
    cy.findByTestId("dashboardcard-actions-panel").icon("click").click();

    cy.findByText("Go to a custom destination").click();
    cy.findByText("Saved question").click();
    cy.findByText("Q1 - 17879").click();
    cy.findByText("Created At").click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    cy.findByText("Done").click();

    saveDashboard();

    cy.wait("@getCardQuery");

    cy.findByTestId("visualization-root").within(() => {
      lineChartCircle().first().click({ force: true });
    });

    cy.url().should("include", "/question");

    cy.findByTestId("qb-filters-panel").should("have.text", expectedFilterText);
  });
}
