import { restore, modal, typeAndBlurUsingLabel } from "__support__/e2e/cypress";

describe("mongodb > admin > add", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.server();
  });

  it("should add a database and redirect to listing", () => {
    cy.route("POST", "/api/database").as("createDatabase");

    cy.visit("/admin/databases/create");
    cy.contains("Database type")
      .closest(".Form-field")
      .find("a")
      .click();
    cy.contains("MongoDB").click({ force: true });
    cy.contains("Additional Mongo connection");

    typeAndBlurUsingLabel("Name", "QA Mongo4");
    typeAndBlurUsingLabel("Host", "localhost");
    typeAndBlurUsingLabel("Port", "27017");
    typeAndBlurUsingLabel("Database name", "sample");
    typeAndBlurUsingLabel("Username", "metabase");
    typeAndBlurUsingLabel("Password", "metasample123");
    typeAndBlurUsingLabel("Authentication Database", "admin");

    cy.findByText("Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.findByText("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();
  });
});
