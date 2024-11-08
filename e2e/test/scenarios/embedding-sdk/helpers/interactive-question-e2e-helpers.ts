import {
  setTokenFeatures,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import { EMBEDDING_SDK_STORY_HOST } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  JWT_SHARED_SECRET,
  setupJwt,
} from "e2e/support/helpers/e2e-jwt-helpers";

const DEFAULT_INTERACTIVE_QUESTION_STORY_ID =
  "embeddingsdk-interactivequestion--default";

export function signInAsAdminAndEnableEmbeddingSdk() {
  cy.signInAsAdmin();
  setTokenFeatures("all");
  setupJwt();
  cy.request("PUT", "/api/setting", {
    "enable-embedding-sdk": true,
  });
}

export const getSdkRoot = () =>
  cy.get("#metabase-sdk-root").should("be.visible");

/** Get storybook args in the format of as "key:value;key:value" */
export function getStorybookArgs(props: Record<string, string>): string {
  const params = new URLSearchParams(props);

  return params.toString().replaceAll("=", ":").replaceAll("&", ";");
}

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
    visitFullAppEmbeddingUrl({
      url: EMBEDDING_SDK_STORY_HOST,
      qs: {
        id: storyId,
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

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });

  cy.wait("@getCard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
