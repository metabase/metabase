import {
  signInAsAdmin,
  restore,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

function addPostgresDatabase() {
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
}

describe("postgres > admin > add", () => {
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

    addPostgresDatabase();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();
  });

  it("should show row details when clicked on its entity key (metabase#13263)", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
    }).as("createDatabase");

    addPostgresDatabase();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=\d+$/);
    cy.contains("Your database has been added!");
    modal()
      .contains("I'm good thanks")
      .click();

    // Repro starts here
    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("QA Postgres12").click();
    cy.findByText("Orders").click();

    // We're clicking on ID: 1 (the first order) => do not change!
    // It is tightly coupled to the assertion ("37.65"), which is "Subtotal" value for that order.
    cy.get(".Table-ID")
      .eq(0)
      .click();

    // Wait until "doing science" spinner disappears (DOM is ready for assertions)
    // TODO: if this proves to be reliable, extract it as a helper function for waiting on DOM to render
    cy.get(".LoadingSpinner").should("not.exist");

    // Assertions
    cy.log("**Fails in v0.36.6**");
    // This could be omitted because real test is searching for "37.65" on the page
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.contains("37.65");
  });
});
