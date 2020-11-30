import {
  signInAsAdmin,
  restore,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

describe("postgres > admin > add", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
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
    // TODO: "Port" label and input field are misconfigured (input field is missing `aria-labeledby` attribute)
    // typeAndBlurUsingLabel("Port", "5432") => this will not work (switching to placeholder temporarily)
    cy.findByPlaceholderText("5432")
      .click()
      .type("5432");
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
