import { restore } from "__support__/e2e/cypress";

describe("scenarios > about Metabase", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/");
    cy.icon("gear").click();
    cy.findByText("About Metabase").click();
  });

  it.skip("should display correct Metabase version (metabase#15656)", () => {
    cy.findByText(/You're on version v[01](\.\d+){2,3}(-[\w\d]+)?/i);
    cy.findByText(/Built on \d{4}-\d{2}-\d{2}/);

    cy.findByText("Branch: ?").should("not.exist");
    cy.findByText("Hash: ?").should("not.exist");
  });
});
