import { restore, startNewQuestion } from "__support__/e2e/helpers";

describe("scenarios > question > loading behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should incrementally load data", () => {
    cy.server();
    // stub out the preload call to fetch all tables
    cy.route({
      url: "/api/database?include=tables",
      status: 500,
      response: {},
    });
    // let the other preload happen since it matches the actual call from the component
    cy.route({ url: "/api/database?saved=true" }).as("fetch1");
    startNewQuestion();

    cy.route({ url: "/api/database/1/schemas" }).as("fetch2");
    cy.route({ url: "/api/database/1/schema/PUBLIC" }).as("fetch3");

    cy.contains("Sample Database").click();
    cy.contains("Orders");

    // confirm that schemas and schema tables were fetched individually,
    // but the bulk load never happened.
    cy.get("@fetch1").should("exist");
    cy.get("@fetch2").should("exist");
    cy.get("@fetch3").should("exist");
  });
});
