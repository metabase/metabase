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

    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");

    cy.visit("/");
    cy.findByText("Pick up where you left off");
    cy.findByText("Orders in a dashboard");
    cy.findByText("Orders, Count").should("not.exist");
  });

  it("should display popular items for a new user", () => {
    restore("default");
    cy.signInAsNormalUser();

    cy.visit("/");
    cy.findByText("Here are some popular items");
    cy.findByText("Orders in a dashboard");
  });
});
