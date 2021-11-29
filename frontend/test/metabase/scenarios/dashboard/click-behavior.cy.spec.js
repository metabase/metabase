import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATASET;

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("should show filters defined on a question with filter pass-thru (metabase#15993)", () => {
    cy.createQuestion({
      name: "15993",
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: { id: question1Id } }) => {
      cy.createNativeQuestion({ native: { query: "select 0" } }).then(
        ({ body: { id: nativeId } }) => {
          cy.createDashboard().then(({ body: { id: dashboardId } }) => {
            // Add native question to the dashboard
            cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
              cardId: nativeId,
            }).then(({ body: { id: dashCardId } }) => {
              // Add click behavior to the dashboard card and point it to the question 1
              cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
                cards: [
                  {
                    id: dashCardId,
                    card_id: nativeId,
                    row: 0,
                    col: 0,
                    sizeX: 12,
                    sizeY: 10,
                    visualization_settings: getVisualizationSettings(
                      question1Id,
                    ),
                  },
                ],
              });

              cy.visit(`/dashboard/${dashboardId}`);

              cy.intercept(
                "POST",
                `/api/dashboard/${dashboardId}/card/${question1Id}/query`,
              ).as("cardQuery");

              cy.intercept("POST", `/api/card/${nativeId}/query`).as(
                "nativeQuery",
              );
            });
          });
        },
      );
    });

    // Drill-through
    cy.wait("@nativeQuery");
    cy.get(".cellData .link")
      .contains("0")
      .realClick();

    cy.wait("@cardQuery");
    cy.contains("117.03").should("not.exist"); // Total for the order in which quantity wasn't 0
    cy.findByText("Quantity is equal to 0");

    const getVisualizationSettings = targetId => ({
      column_settings: {
        '["name","0"]': {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${ORDERS.QUANTITY},null]]`]: {
                source: {
                  type: "column",
                  id: "0",
                  name: "0",
                },
                target: {
                  type: "dimension",
                  id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
                  dimension: ["dimension", ["field", ORDERS.QUANTITY, null]],
                },
                id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
              },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });

  it("should not change the visualization type in a targetted question with mapped filter (metabase#16334)", () => {
    // Question 2, that we're adding to the dashboard
    const questionDetails = {
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    cy.createQuestion({
      name: "16334",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    }).then(({ body: { id: question1Id } }) => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 10,
                visualization_settings: getVisualizationSettings(question1Id),
              },
            ],
          });

          cy.visit(`/dashboard/${dashboard_id}`);

          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/card/${card_id}/query`,
          ).as("cardQuery");
        },
      );
    });

    cy.wait("@cardQuery");
    cy.get(".cellData")
      .contains("5")
      .first()
      .click();

    // Make sure filter is set
    cy.findByText("Rating is equal to 5");

    // Make sure it's connected to the original question
    cy.contains("Started from 16334");

    // Make sure the original visualization didn't change
    cy.findAllByTestId("slice");

    const getVisualizationSettings = targetId => ({
      column_settings: {
        [`["ref",["field",${REVIEWS.RATING},null]]`]: {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${PRODUCTS.RATING},null]]`]: {
                source: {
                  type: "column",
                  id: "RATING",
                  name: "Rating",
                },
                target: {
                  type: "dimension",
                  id: [`["dimension",["field",${PRODUCTS.RATING},null]]`],
                  dimension: ["dimension", ["field", PRODUCTS.RATING, null]],
                },
                id: [`["dimension",["field",${PRODUCTS.RATING},null]]`],
              },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });
});
