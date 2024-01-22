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

    editor.type("select ");

    // can't use cy.type because it does not simulate the bug
    editor.type("USER_");

    // autocomplete_suggestions?prefix=USER_
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

    // autocomplete_suggestions?prefix=USER_
    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("U");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });
});
