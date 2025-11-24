import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  JWT_SHARED_SECRET,
  createQuestion,
  getSignedJwtForResource,
  updateSetting,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountGuestEmbedQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embedding-happy-path", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
      enable_embedding: true,
      embedding_type: "guest-embed",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    cy.signOut();
  });

  it("should show question content", () => {
    cy.get("@questionId").then(async (questionId) => {
      const token = await getSignedJwtForResource({
        resourceId: questionId as unknown as number,
        resourceType: "question",
      });

      mountGuestEmbedQuestion(
        { token },
        { sdkProviderProps: { isGuestEmbed: true } },
      );

      getSdkRoot().within(() => {
        cy.findByText("Product ID").should("be.visible");
        cy.findByText("Max of Quantity").should("be.visible");
      });
    });
  });
});
