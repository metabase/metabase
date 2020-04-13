import {
  signInAsAdmin,
  restore,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

function addMongoDatabase() {
  cy.visit("/admin/databases/create");
  cy.contains("Database type")
    .closest(".Form-field")
    .find("a")
    .click();
  cy.contains("MongoDB").click({ force: true });
  cy.contains("Additional Mongo connection");

  typeAndBlurUsingLabel("Name", "MongoDB");
  typeAndBlurUsingLabel("Database name", "admin");

  cy.findByText("Save")
    .should("not.be.disabled")
    .click();
}

describe("mongodb > admin > add", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    cy.server();
  });

  it("should add a database and redirect to listing", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
    }).as("createDatabase");

    addMongoDatabase();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();
  });

  it("can query a Mongo database", () => {
    addMongoDatabase();
    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("MongoDB").click();
    cy.contains("Version").click();
    cy.contains("featureCompatibilityVersion");
  });
});
