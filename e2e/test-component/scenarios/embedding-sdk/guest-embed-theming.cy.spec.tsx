import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createQuestion,
  getSignedJwtForResource,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountGuestEmbedQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION: StructuredQuestionDetails = {
  name: "Question for Guest Embed SDK",
  enable_embedding: true,
  embedding_type: "guest-embed",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
    breakout: [["field", ORDERS.PRODUCT_ID, null]],
    limit: 2,
  },
};

describe("scenarios > embedding-sdk > guest-embed-theming", () => {
  const setup = ({ display }: { display?: Card["display"] } = {}) => {
    signInAsAdminAndSetupGuestEmbedding({
      token: "starter",
    });

    createQuestion({
      ...QUESTION,
      display,
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    cy.signOut();
  };

  describe("theming", () => {
    it("should apply a theme preset", () => {
      setup();

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion(
          { token, title: true },
          {
            sdkProviderProps: {
              theme: {
                preset: "dark",
                colors: {
                  // Override text
                  "text-primary": "red",
                },
              },
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByTestId("table-root").should(
            "have.css",
            "background-color",
            "rgb(7, 23, 34)",
          );

          cy.findByText("Question for Guest Embed SDK").should(
            "have.css",
            "color",
            "rgba(255, 255, 255, 0.95)",
          );
        });
      });
    });
  });
});
