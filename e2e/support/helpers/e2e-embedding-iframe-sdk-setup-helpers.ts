export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

export const embedModalEnableEmbedding = () =>
  embedModalEnableEmbeddingCard().within(() => {
    cy.findByText(/(Agree and (continue|enable)|Enable)/).click();
  });

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
