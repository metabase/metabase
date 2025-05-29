export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";

export const getSdkRoot = () =>
  cy.get("#metabase-sdk-root").should("be.visible");
