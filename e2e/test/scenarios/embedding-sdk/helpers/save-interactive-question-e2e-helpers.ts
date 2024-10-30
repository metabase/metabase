import {
  entityPickerModal,
  modal,
  popover,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import { EMBEDDING_SDK_STORY_HOST } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";

/** Get storybook args in the format of as "key:value;key:value" */
export function getStorybookArgs(props: Record<string, string>): string {
  const params = new URLSearchParams(props);

  return params.toString().replaceAll("=", ":").replaceAll("&", ";");
}

export function visitInteractiveQuestionStory(
  options: { saveToCollectionId?: number; withCollectionPicker?: boolean } = {},
) {
  const params: Record<string, string> = {
    ...(options.saveToCollectionId && {
      "saveOptions.collectionId": options.saveToCollectionId.toString(),
    }),
    "saveOptions.withCollectionPicker":
      options.withCollectionPicker?.toString() ?? "true",
  };

  cy.get("@questionId").then(questionId => {
    visitFullAppEmbeddingUrl({
      url: EMBEDDING_SDK_STORY_HOST,
      qs: {
        id: "embeddingsdk-interactivequestion--default",
        viewMode: "story",
        args: getStorybookArgs(params),
      },
      onBeforeLoad: (window: any) => {
        window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
        window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
        window.QUESTION_ID = questionId;
      },
    });
  });
}

export function saveInteractiveQuestionAsNewQuestion(
  name: string,
  options: { collectionPath?: string[] } = {},
) {
  const { collectionPath } = options;

  cy.intercept("POST", "/api/card").as("createCard");

  cy.findAllByTestId("cell-data").last().click();
  popover().findByText("See these Orders").click();
  cy.findByRole("button", { name: "Save" }).click();

  modal().within(() => {
    cy.findByRole("radiogroup").findByText("Save as new question").click();

    cy.findByPlaceholderText("What is the name of your question?")
      .clear()
      .type(name);
  });

  if (collectionPath) {
    cy.findByTestId("collection-picker-button").click();

    entityPickerModal().within(() => {
      collectionPath.forEach(collectionName =>
        cy.findByText(collectionName).click(),
      );

      cy.findByRole("button", { name: "Select" }).click();
    });
  }

  modal().within(() => {
    cy.findByRole("button", { name: "Save" }).click();
  });
}
