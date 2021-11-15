import { restore, typeAndBlurUsingLabel } from "__support__/e2e/cypress";

describe("admin > database > add > external databases", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/database").as("createDatabase");
  });

  it("should add Postgres database and redirect to listing", () => {
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

    cy.url().should("match", /\/admin\/databases$/);
    cy.findByText("QA Postgres12");
  });

  it("should add Mongo database and redirect to listing", () => {
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

    cy.url().should("match", /\/admin\/databases$/);
    cy.findByText("QA Mongo4");
  });

  it("should add MySQL database and redirect to listing", () => {
    cy.visit("/admin/databases/create");
    cy.contains("Database type")
      .closest(".Form-field")
      .find("a")
      .click();
    cy.contains("MySQL").click({ force: true });
    cy.contains("Additional JDBC connection string options");

    typeAndBlurUsingLabel("Name", "QA MySQL8");
    typeAndBlurUsingLabel("Host", "localhost");
    typeAndBlurUsingLabel("Port", "3306");
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

    cy.url().should("match", /\/admin\/databases$/);
    cy.findByText("QA MySQL8");
  });
});
