import { restore } from "__support__/e2e/cypress";

describe("scenarios > home > homepage", () => {
  it("should display x-rays for the sample database", () => {
    restore("setup");
    cy.signInAsAdmin();

    cy.visit("/");
    cy.findByText("Try out these sample x-rays to see what Metabase can do.");
    cy.findByText("Orders");
  });

  it("should display x-rays for a user database", () => {
    restore("setup");
    cy.signInAsAdmin();
    cy.addH2SampleDatabase({ name: "H2" });

    cy.visit("/");
    cy.findByText("Here are some explorations of");
    cy.findByText("H2");
    cy.findByText("Orders");
  });

  it("should display recent items", () => {
    restore("default");
    cy.signInAsAdmin();

    cy.visit("/question/2");
    cy.findByText("Orders, Count");

    cy.visit("/");
    cy.findByText("Pick up where you left off");
    cy.findByText("Orders, Count");
  });
});
