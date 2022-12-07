import { restore } from "__support__/e2e/helpers";

describe("issue 23515", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/**/items?pinned_state*").as("getPinnedItems");
    cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
  });

  it("should allow switching between different pages for a pinned question (metabase#23515)", () => {
    cy.request("PUT", `/api/card/1`, { collection_position: 1 });

    cy.visit("/collection/root");
    cy.wait("@getPinnedItems");
    cy.wait("@getCardQuery");

    cy.icon("triangle_right").click();
    cy.findByText("Rows 5-8 of first 2000").should("be.visible");

    cy.icon("triangle_left").click();
    cy.findByText("Rows 1-4 of first 2000").should("be.visible");
  });
});
