export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

export const embedModalEnableEmbedding = () => {
  cy.get("body").then(($body) => {
    if ($body.find('[data-testid="enable-embedding-card"]').length === 0) {
      return;
    }

    // Wait until the card reaches a stable state before deciding what to do:
    // either the button settled on the disabled "Enabled" label (terms already
    // accepted — nothing to do) or it shows an Agree/Enable label we can click.
    // A synchronous early-return races a pending React remount on slower CI
    // runners — e.g. after toggling the auth mode, the previous card's frozen
    // "Enabled" button is still in the DOM when the helper runs, so it would
    // bail out before the next card mounts with a fresh enabled button.
    embedModalEnableEmbeddingCard().within(() => {
      cy.findByRole("button")
        .should(($btn) => {
          const text = $btn.text().trim();
          const isStable =
            text === "Enabled" ||
            /(Agree and (continue|enable)|Enable and continue)/.test(text);
          expect(isStable, `button text "${text}" should be stable`).to.be.true;
        })
        .then(($btn) => {
          if (!$btn.is(":disabled")) {
            cy.wrap($btn).click();
          }
        });
    });
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
