import {
  signInAsAdmin,
  restore,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

function addMySqlDatabase() {
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
  typeAndBlurUsingLabel(
    "Additional JDBC connection string options",
    "allowPublicKeyRetrieval=true",
  );

  cy.findByText("Save")
    .should("not.be.disabled")
    .click();
}

describe("mysql > admin > add", () => {
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

    addMySqlDatabase();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();
  });

  it("should show row details when clicked on its entity key", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
    }).as("createDatabase");

    addMySqlDatabase();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();

    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("QA MySQL8").click();
    cy.findByText("Orders").click();

    // We're clicking on ID: 1 (the first order) => do not change!
    // It is tightly coupled to the assertion ("37.65"), which is "Subtotal" value for that order.
    cy.get(".Table-ID")
      .eq(0)
      .click();

    cy.get(".LoadingSpinner").should("not.exist");

    // Assertions
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.contains("37.65");
  });
});
