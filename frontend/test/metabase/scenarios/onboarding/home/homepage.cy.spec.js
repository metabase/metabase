import { restore } from "__support__/e2e/cypress";

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/automagic-dashboards/database/**").as("getXrays");
  });

  it("should display x-rays for the sample database", () => {
    cy.visit("/");

    cy.wait("@getXrays");
    cy.findByText("Try out these sample x-rays to see what Metabase can do.");
    cy.findByText("Orders");
  });

  it("should display x-rays for a user database", () => {
    cy.addH2SampleDatabase({ name: "H2" });
    cy.visit("/");

    cy.wait("@getXrays");
    cy.findByText("Here are some explorations of");
    cy.findByText("H2");
    cy.findByText("Orders");
  });
});
