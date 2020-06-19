import { signInAsAdmin, restore, popover } from "__support__/cypress";

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

describe("scenarios > admin > databases > add", () => {
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
    typeField("Username", "uberadmin");

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
    typeField("Username", "uberadmin");

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
    typeField("Username", "uberadmin");

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
    typeField("Username", "uberadmin");

    cy.findByText("Save").click();

    cy.wait("@createDatabase");

    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  describe("BigQuery", () => {
    it("should let you upload the service account json from a file", () => {
      cy.visit("/admin/databases/create");

      // select BigQuery
      cy.contains("Database type")
        .parents(".Form-field")
        .find(".AdminSelect")
        .click();
      popover()
        .contains("BigQuery")
        .click({ force: true });

      // enter text
      typeField("Name", "bq db");
      typeField("Dataset ID", "some-dataset");

      // create blob to act as selected file
      cy.get("input[type=file]")
        .then(async input => {
          const blob = await Cypress.Blob.binaryStringToBlob('{"foo": 123}');
          const file = new File([blob], "service-account.json");
          const dataTransfer = new DataTransfer();

          dataTransfer.items.add(file);
          input[0].files = dataTransfer.files;
          return input;
        })
        .trigger("change", { force: true })
        .trigger("blur", { force: true });

      cy.route({
        method: "POST",
        url: "/api/database",
        response: { id: 123 },
        status: 200,
        delay: 100,
      }).as("createDatabase");

      // submit form and check that the file's body is included
      cy.contains("Save").click();
      cy.wait("@createDatabase").should(xhr => {
        expect(xhr.request.body.details["service-account-json"]).to.equal(
          '{"foo": 123}',
        );
      });
    });

    it("should show the old BigQuery form for previously connected databases", () => {
      cy.route({
        method: "GET",
        url: "/api/database/123",
        response: {
          id: 123,
          engine: "bigquery",
          details: {
            "auth-code": "auth-code",
            "client-id": "client-id",
            "client-secret": "client-secret",
            "dataset-id": "dataset-id",
            "project-id": "project",
            "use-jvm-timezone": false,
          },
        },
        status: 200,
        delay: 100,
      });
      cy.visit("/admin/databases/123");

      cy.contains("Connect to a Service Account instead");

      cy.contains("generate a Client ID and Client Secret for your project");
    });
  });
});
