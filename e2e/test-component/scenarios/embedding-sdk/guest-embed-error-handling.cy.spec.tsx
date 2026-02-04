import { MetabotQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, getSignedJwtForResource } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedQuestion,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embed-error-handling", () => {
  beforeEach(() => {
    signInAsAdminAndSetupGuestEmbedding({
      token: "starter",
    });

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
    });

    cy.signOut();
  });

  it("should show JWT token error for invalid token", () => {
    cy.get("@questionId").then(async () => {
      mountGuestEmbedQuestion(
        { token: "foo" },
        {
          shouldAssertCardQuery: false,
        },
      );

      getSdkRoot().within(() => {
        cy.findByText("Passed token is not a valid JWT token.").should(
          "be.visible",
        );
      });
    });
  });

  it("should show an error for an unpublished entity", () => {
    cy.get("@questionId").then(async (questionId) => {
      cy.signInAsAdmin();
      cy.request("PUT", `/api/card/${questionId}`, { enable_embedding: false });
      cy.signOut();

      const token = await getSignedJwtForResource({
        resourceId: questionId as unknown as number,
        resourceType: "question",
      });

      mountGuestEmbedQuestion(
        { token },
        {
          shouldAssertCardQuery: false,
        },
      );

      getSdkRoot().within(() => {
        cy.findByText("Embedding is not enabled for this object.").should(
          "be.visible",
        );
      });
    });
  });

  it("should show an error when an id is passed instead of a token", () => {
    cy.get("@questionId").then(async (questionId) => {
      mountGuestEmbedQuestion(
        { questionId },
        {
          shouldAssertCardQuery: false,
        },
      );

      getSdkRoot().within(() => {
        cy.findByText(
          "A valid JWT token is required to be passed in guest embeds mode.",
        ).should("be.visible");
      });
    });
  });

  it("should show an error when a component does not support guest embed", () => {
    mountSdkContent(<MetabotQuestion />, {
      sdkProviderProps: { authConfig: { isGuest: true } },
    });

    getSdkRoot().within(() => {
      cy.findByText("This component does not support guest embeds").should(
        "be.visible",
      );
    });
  });
});
