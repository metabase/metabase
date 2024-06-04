import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, cypressWaitAll, restore } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_COUNT = 100;
const CARD_SIZE = 4;

const getModelDetails = index => ({
  name: `M${index}`,
  query: {
    "source-table": ORDERS_ID,
    limit: 1,
  },
});

const getQuestionDetails = (modelId, index) => ({
  name: `Q${index}`,
  query: {
    "source-table": `card__${modelId}`,
    limit: 1,
  },
});

describe("issue 41468", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    const modelDetails = Array.from({ length: QUESTION_COUNT }, (_, index) =>
      getModelDetails(index),
    );

    cypressWaitAll(modelDetails.map(createQuestion)).then(modelResponses => {
      const questionDetails = modelResponses.map(({ body: model }, index) =>
        getQuestionDetails(model.id, index),
      );

      cypressWaitAll(questionDetails.map(createQuestion)).then(
        questionResponses => {
          const dashboardDetails = {
            dashcards: questionResponses.map(({ body: question }, index) => ({
              id: question.id,
              card_id: question.id,
              row: index * CARD_SIZE,
              col: 0,
              size_x: CARD_SIZE,
              size_y: CARD_SIZE,
            })),
          };

          cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
            cy.wrap(dashboard.id).as("dashboardId"),
          );
        },
      );
    });
  });

  it("should be able to open a dashboard with many cards based on different data", () => {
    cy.get("@dashboardId").then(dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
  });
});
