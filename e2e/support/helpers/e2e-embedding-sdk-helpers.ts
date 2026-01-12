export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";

export const getSdkRoot = () => cy.get("[data-cy-root]").should("be.visible");

export const getStorybookSdkRoot = () =>
  cy.get("#storybook-root").should("be.visible");
