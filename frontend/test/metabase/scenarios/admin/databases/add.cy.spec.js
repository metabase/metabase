import { restore, popover } from "__support__/e2e/cypress";

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
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
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

    // Instead of bloating our test suite with a separate repro, this line will do
    cy.log(
      "**Repro for [metabase#14334](https://github.com/metabase/metabase/issues/14334)**",
    );
    cy.findByLabelText(
      "Automatically run queries when doing simple filtering and summarizing",
    ).should("have.attr", "aria-checked", "true");

    typeField("Name", "Test db name");
    typeField("Host", "localhost");
    typeField("Database name", "test_postgres_db");
    typeField("Username", "uberadmin");

    cy.button("Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createDatabase");
    cy.url().should("match", /\/admin\/databases\?created=42$/);
  });

  it("should trim fields needed to connect to the database", () => {
    cy.route("POST", "/api/database", { id: 42 }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Host", "localhost  \n  ");
    typeField("Database name", " test_postgres_db");
    typeField("Username", "   uberadmin   ");

    cy.findByText("Save").click();

    cy.wait("@createDatabase").then(({ request }) => {
      expect(request.body.details.host).to.equal("localhost");
      expect(request.body.details.dbname).to.equal("test_postgres_db");
      expect(request.body.details.user).to.equal("uberadmin");
    });
  });

  it("should show validation error if you enable scheduling toggle and enter invalid db connection info", () => {
    cy.route("POST", "/api/database").as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("Name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Username", "uberadmin");

    cy.button("Save")
      .should("not.be.disabled")
      .click();

    cy.wait("@createDatabase");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.button("Next")
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

    cy.button("Save").should("not.be.disabled");

    toggleFieldWithDisplayName("let me choose when Metabase syncs and scans");

    cy.button("Next")
      .should("not.be.disabled")
      .click();

    cy.findByText("Never, I'll do this manually if I need to").click();

    cy.button("Save").click();

    cy.wait("@createDatabase").then(({ request }) => {
      expect(request.body.engine).to.equal("postgres");
      expect(request.body.name).to.equal("Test db name");
      expect(request.body.details.user).to.equal("uberadmin");
    });

    cy.url().should("match", /\/admin\/databases\?created=42$/);
    cy.findByText("Your database has been added!");
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

    cy.button("Save").click();

    cy.wait("@createDatabase");
    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  it("EE should ship with Oracle and Vertica as options", () => {
    cy.onlyOn(!!Cypress.env("HAS_ENTERPRISE_TOKEN"));

    cy.visit("/admin/databases/create");
    cy.contains("Database type")
      .closest(".Form-field")
      .find(".AdminSelect")
      .click();
    popover().within(() => {
      cy.findByText("Oracle");
      cy.findByText("Vertica");
    });
  });

  it("should display a setup help card", () => {
    cy.visit("/admin/databases/create");
    cy.findByTestId("database-setup-help-card").within(() => {
      cy.findByText(/Need help setting up (.*)\?/i);
      cy.findByRole("link", { name: /Our docs can help/i });
    });

    cy.get("#formField-engine").click();
    cy.findByText("MySQL").click();
    cy.findByTestId("database-setup-help-card").findByText(
      "Need help setting up MySQL?",
    );

    cy.get("#formField-engine").click();
    cy.findByText("SQLite").click();
    cy.findByTestId("database-setup-help-card").findByText(
      "Need help setting up your database?",
    );
  });

  it("should display a deprecation warning for a driver", () => {
    cy.visit("/admin/databases/create");

    cy.get("#formField-engine").click();
    cy.findByText("BigQuery").click();

    cy.findByTestId("database-setup-driver-warning").within(() => {
      cy.contains("The old driver has been deprecated");
    });
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
      cy.button("Save").click();
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

  describe("Google Analytics ", () => {
    it("should generate well-formed external auth URLs", () => {
      cy.visit("/admin/databases/create");
      cy.contains("Database type")
        .parents(".Form-field")
        .find(".AdminSelect")
        .click();
      popover()
        .contains("Google Analytics")
        .click({ force: true });

      typeField("Client ID", "   999  ");

      cy.findByText("get an auth code", { exact: false })
        .findByRole("link")
        .then(el => {
          expect(el.attr("href")).to.equal(
            "https://accounts.google.com/o/oauth2/auth?access_type=offline&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/analytics.readonly&client_id=999",
          );
        });
    });
  });
});
