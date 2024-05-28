import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 16334", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
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
          addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              id,
              visualization_settings: getVisualizationSettings(question1Id),
            },
          });

          visitDashboard(dashboard_id);
        },
      );
    });

    cy.findAllByTestId("cell-data").contains("5").first().click();

    // Make sure filter is set
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is equal to 5");

    // Make sure it's connected to the original question
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
