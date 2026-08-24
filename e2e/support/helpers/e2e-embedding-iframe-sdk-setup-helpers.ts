export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

const ACCEPT_TERMS_BUTTON_NAME =
  /(Agree and (continue|enable)|Enable and continue)/;

export const embedModalEnableEmbedding = () => {
  // Wait for the modal before reading the DOM below. That read is a snapshot
  // and does not retry, so on an empty body it takes the early return and the
  // terms are never accepted. The modal is code-split, so it mounts a moment
  // after it is opened rather than in the same tick.
  embedModalContent().should("exist");

  cy.get("body").then(($body) => {
    // No card mounted — terms were accepted in the test setup, the section
    // bails early via `showSection` (see EnableModularEmbeddingSection /
    // EnableGuestEmbedsSection) and never renders.
    if ($body.find('[data-testid="enable-embedding-card"]').length === 0) {
      return;
    }

    // Match the actionable label, not the disabled "Enabled" one — the latter
    // also shows transiently on the stale section after an auth-mode switch.
    cy.findByRole("button", { name: ACCEPT_TERMS_BUTTON_NAME }).click();

    // Retry until the acceptance registered (the clicked section freezes into
    // a disabled "Enabled" button), so a lost click fails here instead of on
    // a misleading iframe timeout downstream (EMB-2292).
    cy.get("body", { timeout: 10_000 }).should(($body) => {
      const isAcceptButtonStillActionable = $body
        .find('[data-testid="enable-embedding-card"] button:enabled')
        .toArray()
        .some((button) =>
          ACCEPT_TERMS_BUTTON_NAME.test(button.textContent ?? ""),
        );

      expect(isAcceptButtonStillActionable, "terms acceptance registered").to.be
        .false;
    });
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
