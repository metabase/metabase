import {
  restore,
  setTokenFeatures,
  visitEmbeddingPage,
} from "e2e/support/helpers";

describe("scenarios > embedding > iframe SDK admin card", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should display the iframe SDK embedding card on the embedding page", () => {
    visitEmbeddingPage();

    // Find the iframe SDK card container and scope all queries to it
    cy.contains(
      '[data-testid="embedding-option-card"]',
      "Embedded analytics SDK for iframe",
    )
      .should("be.visible")
      .within(() => {
        // Check that it has the proper badge
        cy.findByText("Pro and Enterprise").should("be.visible");

        // Check that it has the proper description
        cy.findByText(
          /Embed Metabase components within iframes using the SDK/,
        ).should("be.visible");

        // Check that it has a configure/try it out button
        cy.findByRole("link", { name: /Configure|Try it out/ }).should(
          "be.visible",
        );

        // Check that it has a toggle
        cy.get('[data-testid="switch-with-env-var"]').should("be.visible");
      });
  });

  it("should allow enabling iframe SDK embedding", () => {
    visitEmbeddingPage();

    // Find the iframe SDK card and scope toggle interactions to it
    cy.contains(
      '[data-testid="embedding-option-card"]',
      "Embedded analytics SDK for iframe",
    )
      .should("be.visible")
      .within(() => {
        // The toggle should initially be disabled
        cy.findByLabelText("Disabled").should("be.visible");

        // Click the toggle to enable it
        cy.get('[data-testid="switch-with-env-var"]').click();

        // Verify it shows as enabled (after the API request completes)
        cy.findByLabelText("Enabled").should("be.visible");
      });
  });

  it("should navigate to iframe SDK settings page when configure button is clicked", () => {
    visitEmbeddingPage();

    // Find the iframe SDK card and click its configure button
    cy.contains(
      '[data-testid="embedding-option-card"]',
      "Embedded analytics SDK for iframe",
    )
      .should("be.visible")
      .within(() => {
        cy.findByRole("link", { name: /Configure|Try it out/ }).click();
      });

    // Verify we navigated to the iframe SDK settings page
    cy.url().should(
      "include",
      "/admin/settings/embedding-in-other-applications/iframe-sdk",
    );
  });
});
