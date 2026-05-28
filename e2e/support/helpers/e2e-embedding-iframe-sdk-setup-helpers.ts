export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

export const embedModalEnableEmbedding = () => {
  cy.get("body").then(($body) => {
    const $card = $body.find('[data-testid="enable-embedding-card"]');

    // No enable card on screen — terms were already accepted before mount.
    if ($card.length === 0) {
      return;
    }

    // Once accepted, the action button becomes disabled and shows "Enabled".
    // The card itself stays mounted, so guard against double-clicks.
    if ($card.find("button:disabled").length > 0) {
      return;
    }

    embedModalEnableEmbeddingCard().within(() => {
      cy.findByText(
        /(Agree and (continue|enable)|Enable and continue)/,
      ).click();
    });
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
