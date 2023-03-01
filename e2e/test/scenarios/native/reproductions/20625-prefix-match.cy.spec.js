import { restore, openNativeEditor } from "e2e/support/helpers";

describe("issue 20625", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/native-query-autocomplete-match-style", {
      value: "prefix",
    });
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/database/*/autocomplete_suggestions**").as(
      "autocomplete",
    );
  });

  it("should continue to request more prefix matches (metabase#20625)", () => {
    openNativeEditor().type("s");

    // autocomplete_suggestions?prefix=s
    cy.wait("@autocomplete");

    // can't use cy.type because it does not simulate the bug
    cy.realPress("o");

    // autocomplete_suggestions?prefix=so
    cy.wait("@autocomplete");
  });
});
