import { signInAsAdmin, restore } from "__support__/cypress";

describe("query builder loading behavior", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should preload tables on the new question page", () => {
    cy.server();
    cy.visit("/question/new");

    cy.route({ url: "/api/database?include=tables" }).as("preload1");
    cy.route({ url: "/api/database?saved=true" }).as("preload2");
    cy.route({ url: "/api/database/1/schemas" }).as("fetch1");
    cy.route({ url: "/api/database/1/schema/PUBLIC" }).as("fetch2");

    // preload calls should have already happened before picking question type
    cy.wait("@preload1");
    cy.wait("@preload2");

    cy.contains("Simple question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders");

    // confirm that neither fetch happened after seeing data in UI
    cy.get("@fetch1").should("not.exist");
    cy.get("@fetch2").should("not.exist");
  });

  it("should incrementally load data if not preloaded", () => {
    // we visit the new question page but refresh after starting a simple
    // question to wipe out the preloaded data.
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.server();
    cy.reload();

    cy.route({ url: "/api/database?include=tables" }).as("preload");
    cy.route({ url: "/api/database?saved=true" }).as("fetch1");
    cy.route({ url: "/api/database/1/schemas" }).as("fetch2");
    cy.route({ url: "/api/database/1/schema/PUBLIC" }).as("fetch3");

    cy.contains("Sample Dataset").click();
    cy.contains("Orders");

    // confirm that schemas and schema tables were fetched individually,
    // but the bulk load never happened.
    cy.get("@fetch1").should("exist");
    cy.get("@fetch2").should("exist");
    cy.get("@fetch3").should("exist");
    cy.get("@preload").should("not.exist");
  });
});
