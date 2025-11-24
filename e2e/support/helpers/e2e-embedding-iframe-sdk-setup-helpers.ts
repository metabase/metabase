export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEmbeddingControlCard = () =>
  cy.findByTestId("embedding-control-card");

export const embedModalEnableEmbedding = () =>
  embedModalEmbeddingControlCard().within(() => {
    cy.findByText(/(Agree and (continue|enable)|Enable)/).click();
  });

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
