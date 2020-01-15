import { signInAsAdmin, restore } from "__support__/cypress";

function typeField(label, value) {
  cy.findByLabelText(label)
    .clear()
    .type(value)
    .blur();
}

function toggleFieldWithDisplayName(displayName) {
  cy.contains(displayName)
    .closest(".Form-field")
    .find("a")
    .click();
}

describe("admin > databases > add", () => {
  before(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
  });

  it("should add a database and redirect to listing", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
      response: { id: 42 },
      delay: 1000,
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Database username", "uberadmin");

    cy.findByText("Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=42$/);
  });

  it("should show validation error if you enable scheduling toggle and enter invalid db connection info", () => {
    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Database username", "uberadmin");

    cy.findByText("Save").should("not.be.disabled");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.findByText("Next")
      .should("not.be.disabled")
      .click();

    cy.findByText(
      "Couldn't connect to the database. Please check the connection details.",
    );
  });

  it("should direct you to scheduling settings if you enable the toggle", () => {
    cy.route("POST", "/api/database", { id: 42 }).as("createDatabase");
    cy.route("POST", "/api/database/validate", { valid: true });

    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Database username", "uberadmin");

    cy.findByText("Save").should("not.be.disabled");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.findByText("Next")
      .should("not.be.disabled")
      .click();

    cy.findByText("Never, I'll do this manually if I need to").click();

    cy.findByText("Save").click();

    cy.wait("@createDatabase").then(({ request }) => {
      expect(request.body.engine).to.equal("postgres");
      expect(request.body.name).to.equal("Test db name");
      expect(request.body.details.user).to.equal("uberadmin");
    });

    cy.url().should("match", /\/admin\/databases\?created=42$/);

    cy.findByText("Your database has been added!").should("exist");
  });

  it("should show error correctly on server error", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
      response: "DATABASE CONNECTION ERROR",
      status: 400,
      delay: 1000,
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Database username", "uberadmin");

    cy.findByText("Save").click();

    cy.wait("@createDatabase");

    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });
});
