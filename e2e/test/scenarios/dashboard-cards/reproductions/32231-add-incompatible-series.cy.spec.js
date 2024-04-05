import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { editDashboard, restore, visitDashboard } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const baseQuestion = {
  name: "Base question",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
  display: "bar",
};

const incompleteQuestion = {
  name: "Incomplete question",
  native: {
    query: "select 1;",
  },
  visualization_settings: {
    "graph.dimensions": [null],
    "graph.metrics": ["1"],
  },
  display: "bar",
};

const issue32231Error = "Cannot read properties of undefined (reading 'name')";
const multipleSeriesError = "Unable to combine these questions";
const defaultError = "Which fields do you want to use for the X and Y axes?";

describe("issue 32231", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/card/*/series?limit=*").as("seriesQuery");
  });

  it("should show user-friendly error when combining series that cannot be visualized together (metabase#32231)", () => {
    cy.createNativeQuestion(incompleteQuestion);
    cy.createQuestionAndDashboard({ questionDetails: baseQuestion }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
    cy.findByTestId("add-series-button").click({ force: true });
    cy.wait("@seriesQuery");

    cy.findByTestId("add-series-modal").within(() => {
      cy.get("[data-element-id=line-area-bar-chart]").should("exist");
      cy.findByText(issue32231Error).should("not.exist");
      cy.findByText(multipleSeriesError).should("not.exist");
      cy.findByText(defaultError).should("not.exist");

      cy.findByLabelText(incompleteQuestion.name).click();

      cy.get("[data-element-id=line-area-bar-chart]").should("not.exist");
      cy.findByText(issue32231Error).should("not.exist");
      cy.findByText(multipleSeriesError).should("exist");
      cy.findByText(defaultError).should("not.exist");

      cy.findByLabelText(incompleteQuestion.name).click();

      cy.get("[data-element-id=line-area-bar-chart]").should("exist");
      cy.findByText(issue32231Error).should("not.exist");
      cy.findByText(multipleSeriesError).should("not.exist");
      cy.findByText(defaultError).should("not.exist");
    });
  });

  it("should show default visualization error message when the only series is incomplete", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails: incompleteQuestion,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 10,
          },
        ],
      });

      visitDashboard(dashboard_id);
    });

    cy.findByTestId("dashcard").findByText(defaultError).should("exist");

    cy.icon("pencil").click();
    cy.findByTestId("add-series-button").click({ force: true });
    cy.wait("@seriesQuery");

    cy.findByTestId("add-series-modal").within(() => {
      cy.get("[data-element-id=line-area-bar-chart]").should("not.exist");
      cy.findByText(issue32231Error).should("not.exist");
      cy.findByText(multipleSeriesError).should("not.exist");
      cy.findByText(defaultError).should("exist");
    });
  });
});
