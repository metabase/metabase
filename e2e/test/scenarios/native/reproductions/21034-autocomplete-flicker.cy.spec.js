import { restore, openNativeEditor } from "e2e/support/helpers";

describe("issue 21034", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openNativeEditor();
    cy.intercept(
      "GET",
      "/api/database/**/autocomplete_suggestions?**",
      cy.spy().as("suggestions"),
    );
  });

  it("should not invoke API calls for autocomplete twice in a row (metabase#18148)", () => {
    cy.get(".ace_content").should("be.visible").type("p");

    // Wait until another explicit autocomplete is triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    cy.wait(1000);

    cy.get("@suggestions").its("callCount").should("equal", 1);
  });
});
