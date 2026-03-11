export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

export const embedModalEnableEmbedding = () => {
  cy.get("body").then(($body) => {
    const isEmbeddingDisabled =
      $body.find('[data-testid="enable-embedding-card"]').length > 0;

    if (isEmbeddingDisabled) {
      embedModalEnableEmbeddingCard().within(() => {
        cy.findByText(
          /(Agree and (continue|enable)|Enable and continue)/,
        ).click();
      });
    }
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
