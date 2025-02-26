import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createQuestion,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountInteractiveQuestion,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { PEOPLE, PRODUCTS, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const BASE_PIVOT_TABLE_QUESTION: StructuredQuestionDetails = {
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
  display: "pivot",
};

const setup = (callback: () => void) => {
  signInAsAdminAndEnableEmbeddingSdk();

  callback();

  cy.signOut();

  mockAuthProviderAndJwtSignIn();
};

describe("scenarios > embedding-sdk > Pivot Table reproductions", () => {
  describe("Pivot Table wrong size after switching from other visualization type (#53901)", () => {
    beforeEach(() => {
      setup(() => {
        createQuestion({
          ...BASE_PIVOT_TABLE_QUESTION,
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

  describe("Pivot Table does not run query (#53903)", () => {
    beforeEach(() => {
      setup(() => {
        createQuestion(BASE_PIVOT_TABLE_QUESTION).then(({ body: question }) => {
          cy.wrap(question.id).as("questionId");
          cy.wrap(question.entity_id).as("questionEntityId");
        });
      });
    });

    it("should rerun query on grouping change", () => {
      mountInteractiveQuestion();

      getSdkRoot().within(() => {
        cy.findByTestId("pivot-table").within(() => {
          cy.findByText("User → Source").should("exist");
        });

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("2 groupings").click();
        });

        cy.findByRole("dialog").within(() => {
          cy.findByText("User → Source").click();

          cy.findAllByTestId("dimension-list-item")
            .contains("Created At")
            .click();
        });

        cy.findByTestId("pivot-table").within(() => {
          cy.findByText("User → Source").should("not.exist");

          cy.findByText("User → Created At: Month").should("exist");
        });
      });
    });
  });
});
