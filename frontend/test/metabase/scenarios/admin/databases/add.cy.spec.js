import { signInAsAdmin, snapshot, restore } from "__support__/cypress";
import { saveFile } from "jsrsasign";

function typeField(name, value) {
  cy.get(`input[name="${name}"]`)
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
  before(snapshot);
  after(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
  });

  it("should work and shouldn't let you accidentally add db twice", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
      response: { id: 42 },
      delay: 1000,
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("name", "Test db name");
    typeField("dbname", "test_postgres_db");
    typeField("user", "uberadmin");

    cy.contains("button", "Save")
      .should("not.be.disabled")
      .click();
    cy.contains("button", "Saving...").should("be.disabled");

    cy.wait("@createDatabase");

    cy.url().should("match", /\/admin\/databases\?created=42$/);
  });

  it("should show validation error if you enable scheduling toggle and enter invalid db connection info", () => {
    cy.visit("/admin/databases/create");

    typeField("name", "Test db name");
    typeField("dbname", "test_postgres_db");
    typeField("user", "uberadmin");

    cy.contains("button", "Save").should("not.be.disabled");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.contains("button", "Next")
      .should("not.be.disabled")
      .click();

    cy.contains("Couldn't connect to the database");
  });

  it("should direct you to scheduling settings if you enable the toggle", () => {
    cy.route("POST", "/api/database", { id: 42 }).as("createDatabase");
    cy.route("POST", "/api/database/validate", { valid: true });

    cy.visit("/admin/databases/create");

    typeField("name", "Test db name");
    typeField("dbname", "test_postgres_db");
    typeField("user", "uberadmin");

    cy.contains("button", "Save").should("not.be.disabled");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.contains("button", "Next")
      .should("not.be.disabled")
      .click();

    cy.contains("Never").click();

    cy.contains("button", "Save").click();

    cy.wait("@createDatabase").then(({ request }) => {
      expect(request.body.engine).to.equal("postgres");
      expect(request.body.name).to.equal("Test db name");
      expect(request.body.details.user).to.equal("uberadmin");
    });

    cy.url().should("match", /\/admin\/databases\?created=42$/);

    cy.contains("Your database has been added");
  });

  it("should show error correctly on server error", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
      response: {},
      status: 400,
      delay: 1000,
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("name", "Test db name");
    typeField("dbname", "test_postgres_db");
    typeField("user", "uberadmin");

    cy.contains("button", "Save").click();
    cy.contains("button", "Saving...").should("be.disabled");

    cy.contains("Server error encountered");
  });
});
