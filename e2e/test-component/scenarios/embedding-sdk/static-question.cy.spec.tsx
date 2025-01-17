import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountStaticQuestion,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > static-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
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

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show question content", () => {
    mountStaticQuestion();

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Max of Quantity").should("be.visible");
    });
  });

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        questionIdAlias: "@questionEntityId",
      },
      {
        name: "correct number ID",
        questionIdAlias: "@questionId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        questionId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        questionId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        questionId: 9999,
      },
    ];

    successTestCases.forEach(({ name, questionIdAlias }) => {
      it(`should load question content for ${name}`, () => {
        cy.get(questionIdAlias).then(questionId => {
          mountStaticQuestion({ questionId });
        });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, questionId }) => {
      it(`should show an error message for ${name}`, () => {
        mountStaticQuestion({ questionId }, { shouldAssertCardQuery: false });

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Question ${questionId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);
          cy.findByText("Product ID").should("not.exist");
          cy.findByText("Max of Quantity").should("not.exist");
        });
      });
    });
  });
});
