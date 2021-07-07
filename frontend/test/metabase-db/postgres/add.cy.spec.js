import { restore, modal, typeAndBlurUsingLabel } from "__support__/e2e/cypress";

describe("postgres > admin > add", () => {
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
    cy.contains("PostgreSQL").click({ force: true });
    cy.contains("Additional JDBC connection string options");

    typeAndBlurUsingLabel("Name", "QA Postgres12");
    typeAndBlurUsingLabel("Host", "localhost");
    typeAndBlurUsingLabel("Port", "5432");
    typeAndBlurUsingLabel("Database name", "sample");
    typeAndBlurUsingLabel("Username", "metabase");
    typeAndBlurUsingLabel("Password", "metasample123");

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
