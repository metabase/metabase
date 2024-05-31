import { restore, openNativeEditor } from "e2e/support/helpers";

describe("issue 34330", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/database/*/autocomplete_suggestions**").as(
      "autocomplete",
    );
  });

  it("should only call the autocompleter with all text typed (metabase#34330)", () => {
    const editor = openNativeEditor();

    // can't use cy.type because it does not simulate the bug
    // Delay needed for React 18. TODO: fix shame
    editor.type("USER").type("_", { delay: 1000 });

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("USER_");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter eventually, even when only 1 character was typed (metabase#34330)", () => {
    const editor = openNativeEditor();

    // can't use cy.type because it does not simulate the bug
    editor.type("U");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("U");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter when backspacing to a 1-character prefix(metabase#34330)", () => {
    const editor = openNativeEditor();

    // can't use cy.type because it does not simulate the bug
    editor.type("SE{backspace}");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("S");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });
});
