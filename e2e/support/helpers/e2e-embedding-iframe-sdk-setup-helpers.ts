export const getEmbedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const getEmbedModalEmbeddingControlCard = () =>
  cy.findByTestId("embedding-control-card");

export const embedModalEnableEmbedding = () =>
  getEmbedModalEmbeddingControlCard().within(() => {
    cy.findByText(/(Agree and (continue|enable)|Enable)/).click();
  });

export const getLegacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
