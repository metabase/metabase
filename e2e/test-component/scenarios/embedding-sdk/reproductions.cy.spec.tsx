import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountInteractiveQuestion,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { PEOPLE, PRODUCTS, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const setup = (callback: () => void) => {
  signInAsAdminAndEnableEmbeddingSdk();

  callback();

  cy.signOut();

  mockAuthProviderAndJwtSignIn();
};

describe("scenarios > embedding-sdk > reproductions", () => {
  describe("Pivot Table wrong size after switching from other visualization type (#53901)", () => {
    beforeEach(() => {
      setup(() => {
        createQuestion({
          name: "47563",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PEOPLE.SOURCE,
                { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
              ],
              [
                "field",
                PRODUCTS.CATEGORY,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
          display: "table",
        }).then(({ body: question }) => {
          cy.wrap(question.id).as("questionId");
          cy.wrap(question.entity_id).as("questionEntityId");
        });
      });
    });

    it("should set proper size for a Pivot Table", () => {
      mountInteractiveQuestion();

      getSdkRoot().within(() => {
        cy.findByTestId("chart-type-selector-button").click();
        cy.findByRole("menu").within(() => {
          cy.findByText("Pivot Table").click();
        });

        cy.findByTestId("pivot-table").within(() => {
          cy.findByText("Row totals").should("be.visible");
          cy.findByText("Grand totals").should("be.visible");
        });
      });
    });
  });
});
