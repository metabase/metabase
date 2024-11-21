import { visitSdkStory } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const DEFAULT_INTERACTIVE_QUESTION_STORY_ID =
  "embeddingsdk-interactivequestion--default";

export function visitInteractiveQuestionStory({
  storyId = DEFAULT_INTERACTIVE_QUESTION_STORY_ID,
  saveToCollectionId,
}: { storyId?: string; saveToCollectionId?: number } = {}) {
  const params: Record<string, string> = {
    ...(saveToCollectionId && {
      saveToCollectionId: saveToCollectionId.toString(),
    }),
  };

  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("GET", "/api/user/current").as("getUser");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get("@questionId").then(questionId => {
    visitSdkStory({
      storyId,
      args: params,
      windowEnvs: { QUESTION_ID: questionId },
    });
  });

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });

  cy.wait("@getCard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
