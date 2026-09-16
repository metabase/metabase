export const embedModalContent = () =>
  cy.findByTestId("sdk-iframe-embed-setup-modal-content");

export const embedModalEnableEmbeddingCard = () =>
  cy.findByTestId("enable-embedding-card");

// The card renders a single button, disabled once the terms are accepted, so
// an enabled one is the accept button and nothing else.
const ACCEPT_TERMS_BUTTON =
  '[data-testid="enable-embedding-card"] button:not([disabled])';

export const embedModalEnableEmbedding = () => {
  // Wait for the modal before reading the DOM below. That read is a snapshot
  // and does not retry, so on an empty body it takes the early return and the
  // terms are never accepted. The modal is code-split, so it mounts a moment
  // after it is opened rather than in the same tick.
  embedModalContent().should("exist");

  cy.get("body").then(($body) => {
    // Nothing left to accept. Either no card mounted — terms were accepted in
    // the test setup and the section bails early via `showSection` (see
    // EnableModularEmbeddingSection / EnableGuestEmbedsSection) — or a section
    // that mounted on stale settings settled on its disabled "Enabled" label.
    if ($body.find(ACCEPT_TERMS_BUTTON).length === 0) {
      return;
    }

    cy.get(ACCEPT_TERMS_BUTTON).click();

    // Once the acceptance registers, the section freezes and relabels its
    // button to a disabled "Enabled", so the enabled button going away is the
    // signal. Asserting it here makes a lost click fail on the spot instead of
    // on a misleading iframe timeout downstream (EMB-2292).
    cy.get(ACCEPT_TERMS_BUTTON, { timeout: 10_000 }).should("not.exist");
  });
};

export const legacyStaticEmbeddingButton = () =>
  cy.findByTestId("legacy-static-embedding-button");
