import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  entityPickerModal,
  restore,
} from "e2e/support/helpers";
import { describeSDK } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  getSdkRoot,
  signInAsAdminAndEnableEmbeddingSdk,
  visitInteractiveQuestionStory,
} from "e2e/test/scenarios/embedding-sdk/helpers/interactive-question-e2e-helpers";
import { saveInteractiveQuestionAsNewQuestion } from "e2e/test/scenarios/embedding-sdk/helpers/save-interactive-question-e2e-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeSDK("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    restore();
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion(
      {
        name: "47563",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
      },
      { wrapId: true },
    );

    cy.signOut();
  });

  it("can create questions via the CreateQuestion component", () => {
    visitInteractiveQuestionStory({
      storyId: "embeddingsdk-createquestion--default",
    });

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    entityPickerModal().within(() => {
      cy.findByText("Tables").click();
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Visualize" }).click();

      // Should be able to go back to the editor view
      cy.findByRole("button", { name: "Show editor" }).click();

      // Should be able to visualize the question again
      cy.findByRole("button", { name: "Visualize" }).click();
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "CreateQuestion Sample Orders",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("CreateQuestion Sample Orders");
    });
  });
});
