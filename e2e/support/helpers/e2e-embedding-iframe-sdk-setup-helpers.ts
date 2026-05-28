export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

export const embedModalEnableEmbedding = () => {
  cy.get("body").then(($body) => {
    // No card mounted — terms were accepted in the test setup, the section
    // bails early via `showSection` (see EnableModularEmbeddingSection /
    // EnableGuestEmbedsSection) and never renders.
    if ($body.find('[data-testid="enable-embedding-card"]').length === 0) {
      return;
    }

    // Wait for the actionable Agree/Enable button on the freshly mounted
    // section for the currently-selected auth mode, then click it.
    //
    // We intentionally do NOT treat the disabled "Enabled" label as a
    // terminal no-op: it appears legitimately after this helper clicks
    // Agree (the section freezes via `useState`), but it ALSO appears
    // transiently on the *stale* section from a previous auth-mode
    // selection before React commits the unmount. Bailing on it was the
    // original bug. Matching the actionable label scopes us to the new
    // section automatically, since the stale one shows only "Enabled".
    cy.findByRole("button", {
      name: /(Agree and (continue|enable)|Enable and continue)/,
    }).click();
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
