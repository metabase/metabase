import { restore } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("adding an additional series to a dashcard (metabase#20637)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should use the correct query endpoints (metabase#20637)", () => {
    createQuestionsAndDashboard();
    cy.wait("@dashcardQuery");

    // edit the dashboard and open the add series modal
    cy.icon("pencil").click();
    // the button is made clickable by css using :hover so we need to force it
    cy.findByTestId("add-series-button").click({ force: true });

    cy.findByText("20637 Question 2").click();
    // make sure the card query endpoint was used
    cy.wait("@additionalSeriesCardQuery");

    cy.get(".AddSeriesModal").within(() => {
      cy.findByText("Done").click();
    });
    saveDashboard();

    // refresh the page and make sure the dashcard query endpoint was used
    cy.reload();
    cy.wait(["@dashcardQuery", "@additionalSeriesDashcardQuery"]);
  });
});

function saveDashboard() {
  cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  cy.intercept("PUT", "/api/dashboard/*/cards").as("updateDashCards");
  cy.intercept("GET", "/api/dashboard/*").as("loadDashboard");

  cy.findByText("Save").click();

  cy.wait(["@updateDashboard", "@updateDashCards", "@loadDashboard"]);
}

function createQuestionsAndDashboard() {
  const dashcardQuestion = {
    name: "20637 Question 1",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "line",
  };

  const additionalSeriesQuestion = {
    name: "20637 Question 2",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "bar",
  };

  cy.createQuestion(additionalSeriesQuestion).then(
    ({ body: { id: additionalSeriesId } }) => {
      cy.intercept("POST", `/api/card/${additionalSeriesId}/query`).as(
        "additionalSeriesCardQuery",
      );

      cy.createQuestionAndDashboard({ questionDetails: dashcardQuestion }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 10,
              },
            ],
          });

          cy.visit(`/dashboard/${dashboard_id}`);

          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
          ).as("dashcardQuery");

          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/dashcard/*/card/${additionalSeriesId}/query`,
          ).as("additionalSeriesDashcardQuery");
        },
      );
    },
  );
}
