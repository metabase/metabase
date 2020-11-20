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

  typeAndBlurUsingLabel("Name", "QA Mongo4");
  typeAndBlurUsingLabel("Host", "localhost");
  cy.findByPlaceholderText("27017")
    .click()
    .type("27017");
  typeAndBlurUsingLabel("Database name", "sample");
  typeAndBlurUsingLabel("Username", "metabase");
  typeAndBlurUsingLabel("Password", "metasample123");
  typeAndBlurUsingLabel("Authentication Database", "admin");

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
    cy.contains("QA Mongo4").click();
    cy.contains("Orders").click();
    cy.contains("37.65");
  });
});
