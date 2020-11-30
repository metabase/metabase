import {
  signInAsAdmin,
  restore,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

describe("mysql > admin > add", () => {
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
    cy.contains("MySQL").click({ force: true });
    cy.contains("Additional JDBC connection string options");

    typeAndBlurUsingLabel("Name", "QA MySQL8");
    typeAndBlurUsingLabel("Host", "localhost");
    // TODO: "Port" label and input field are misconfigured (input field is missing `aria-labeledby` attribute)
    // typeAndBlurUsingLabel("Port", "3306") => this will not work (switching to placeholder temporarily)
    cy.findByPlaceholderText("3306")
      .click()
      .type("3306");
    typeAndBlurUsingLabel("Database name", "sample");
    typeAndBlurUsingLabel("Username", "metabase");
    typeAndBlurUsingLabel("Password", "metasample123");

    // Bypass the RSA public key error for MySQL database
    // https://github.com/metabase/metabase/issues/12545
    typeAndBlurUsingLabel(
      "Additional JDBC connection string options",
      "allowPublicKeyRetrieval=true",
    );

    cy.findByText("Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();
  });
});
