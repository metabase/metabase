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
  options: { saveToCollectionId?: number } = {},
) {
  const params: Record<string, string> = {
    ...(options.saveToCollectionId && {
      saveToCollectionId: options.saveToCollectionId.toString(),
    }),
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

export function saveInteractiveQuestionAsNewQuestion(options: {
  questionName: string;
  entityName: string;
  collectionPickerPath?: string[];
}) {
  const { questionName, entityName, collectionPickerPath } = options;

  cy.intercept("POST", "/api/card").as("createCard");

  cy.findAllByTestId("cell-data").last().click();
  popover().findByText(`See these ${entityName}`).click();
  cy.findByRole("button", { name: "Save" }).click();

  modal().within(() => {
    cy.findByRole("radiogroup").findByText("Save as new question").click();

    cy.findByPlaceholderText("What is the name of your question?")
      .clear()
      .type(questionName);
  });

  if (collectionPickerPath) {
    cy.findByTestId("collection-picker-button").click();

    entityPickerModal().within(() => {
      collectionPickerPath.forEach(collectionName =>
        cy.findByText(collectionName).click(),
      );

      cy.findByRole("button", { name: "Select" }).click();
    });
  }

  modal().within(() => {
    cy.findByRole("button", { name: "Save" }).click();
  });
}
