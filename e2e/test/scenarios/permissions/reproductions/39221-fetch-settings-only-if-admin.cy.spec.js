import { restore, startNewNativeQuestion, popover } from "e2e/support/helpers";

describe("issue 39221", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/setting").as("siteSettings");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");

    restore();
    cy.signInAsAdmin();

    cy.request("POST", "/api/database", {
      engine: "sqlite",
      name: "sqlite",
      details: { db: "./resources/sqlite-fixture.db" },
    });
  });

  it("admins should fetch site settings", () => {
    startNewNativeQuestion();
    popover().findByText("Sample Database").click();
    cy.wait("@sessionProperties");

    cy.get("@siteSettings").should("not.be.null");
  });

  it("non-admins should not fetch site settings (metabase#39221)", () => {
    cy.signInAsNormalUser();

    startNewNativeQuestion();
    popover().findByText("Sample Database").click();
    cy.wait("@sessionProperties");

    cy.get("@siteSettings").should("be.null");
  });
});
