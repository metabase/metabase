import {
  restore,
  popover,
  describeEE,
  mockSessionProperty,
  isEE,
} from "__support__/e2e/helpers";

function typeField(label, value) {
  cy.findByLabelText(label).clear().type(value).blur();
}

function toggleFieldWithDisplayName(displayName) {
  cy.contains(displayName).closest(".Form-field").find("input").click();
}

function selectFieldOption(fieldName, option) {
  cy.contains(fieldName)
    .parents(".Form-field")
    .findByTestId("select-button")
    .click();
  popover().contains(option).click({ force: true });
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
    cy.findByText("Show advanced options").click();
    cy.findByLabelText("Rerun queries for simple explorations").should(
      "have.attr",
      "aria-checked",
      "true",
    );

    typeField("Display name", "Test db name");
    typeField("Host", "localhost");
    typeField("Database name", "test_postgres_db");
    typeField("Username", "uberadmin");

    cy.button("Save").should("not.be.disabled").click();

    cy.wait("@createDatabase");

    cy.findByText("We're taking a look at your database!");
    cy.findByText("Explore sample data");
  });

  it("should trim fields needed to connect to the database", () => {
    cy.route("POST", "/api/database", { id: 42 }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeField("Display name", "Test db name");
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

    chooseDatabase("H2");
    typeField("Display name", "Test db name");
    typeField("Connection String", "invalid");

    cy.findByText("Show advanced options").click();
    toggleFieldWithDisplayName("Choose when syncs and scans happen");

    cy.button("Save").click();
    cy.wait("@createDatabase");
    cy.findByText(": check your connection string");
    cy.findByText("Implicitly relative file paths are not allowed.");
  });

  it("should show scheduling settings if you enable the toggle", () => {
    cy.route("POST", "/api/database", { id: 42 }).as("createDatabase");
    cy.route("POST", "/api/database/validate", { valid: true });

    cy.visit("/admin/databases/create");

    typeField("Display name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Username", "uberadmin");

    cy.findByText("Show advanced options").click();
    toggleFieldWithDisplayName("Choose when syncs and scans happen");

    cy.findByText("Never, I'll do this manually if I need to").click();

    cy.button("Save").click();

    cy.wait("@createDatabase").then(({ request }) => {
      expect(request.body.engine).to.equal("postgres");
      expect(request.body.name).to.equal("Test db name");
      expect(request.body.details.user).to.equal("uberadmin");
    });

    cy.url().should("match", /admin\/databases\?created=true$/);
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

    typeField("Display name", "Test db name");
    typeField("Database name", "test_postgres_db");
    typeField("Username", "uberadmin");

    cy.button("Save").click();

    cy.wait("@createDatabase");
    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  it("EE should ship with Oracle and Vertica as options", () => {
    cy.onlyOn(isEE);

    cy.visit("/admin/databases/create");
    cy.contains("Database type")
      .closest(".Form-field")
      .findByTestId("select-button")
      .click();
    popover().within(() => {
      cy.findByText("Oracle");
      cy.findByText("Vertica");
    });
  });

  it("should display a setup help card", () => {
    cy.visit("/admin/databases/create");
    cy.findByText("Need help connecting?");
  });

  // TODO:
  // Enable once https://github.com/metabase/metabase/issues/24900 gets fixed!
  it.skip("should respect users' decision to manually sync large database (metabase#17450)", () => {
    const H2_CONNECTION_STRING =
      "zip:./target/uberjar/metabase.jar!/sample-database.db;USER=GUEST;PASSWORD=guest";

    const databaseName = "Another H2";

    cy.intercept("POST", "/api/database").as("createDatabase");
    cy.visit("/admin/databases/create");

    chooseDatabase("H2");

    typeField("Display name", databaseName);
    typeField("Connection String", H2_CONNECTION_STRING);

    cy.findByText("Show advanced options").click();
    cy.findByLabelText("Choose when syncs and scans happen")
      .click()
      .should("have.attr", "aria-checked", "true");

    isSyncOptionSelected("Never, I'll do this manually if I need to");

    cy.button("Save").click();
    cy.wait("@createDatabase");

    cy.findByText("We're taking a look at your database!");
    cy.findByLabelText("close icon").click();

    cy.findByRole("table").within(() => {
      cy.findByText(databaseName).click();
    });

    isSyncOptionSelected("Never, I'll do this manually if I need to");
  });

  describe("BigQuery", () => {
    it("should let you upload the service account json from a file", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("BigQuery");

      // enter text
      typeField("Display name", "bq db");
      // typeField("Dataset ID", "some-dataset");
      selectFieldOption("Datasets", "Only these...");
      cy.findByPlaceholderText("E.x. public,auth*").type("some-dataset");

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

    it("should display driver deprecation messages", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("Presto");

      cy.findByText("Presto");
      cy.findByText("Need help connecting?");

      cy.findByText("find it here").click();
      cy.findByText("Presto (Deprecated Driver)");
      cy.findByText("Need help connecting?");
    });
  });

  describe("Google Analytics ", () => {
    it("should let you upload the service account json from a file", () => {
      cy.visit("/admin/databases/create");
      chooseDatabase("Google Analytics");

      typeField("Display name", "google analytics");

      typeField("Google Analytics Account ID", " 999  ");

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
  });

  describeEE("caching", () => {
    beforeEach(() => {
      mockSessionProperty("enable-query-caching", true);
    });

    it("sets cache ttl to null by default", () => {
      cy.intercept("POST", "/api/database", { id: 42 }).as("createDatabase");
      cy.visit("/admin/databases/create");

      typeField("Display name", "Test db name");
      typeField("Host", "localhost");
      typeField("Database name", "test_postgres_db");
      typeField("Username", "uberadmin");

      cy.findByText("Show advanced options").click();
      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(null);
      });
    });

    it("allows to set cache ttl", () => {
      cy.intercept("POST", "/api/database", { id: 42 }).as("createDatabase");
      cy.visit("/admin/databases/create");

      typeField("Display name", "Test db name");
      typeField("Host", "localhost");
      typeField("Database name", "test_postgres_db");
      typeField("Username", "uberadmin");

      cy.findByText("Show advanced options").click();
      cy.findByText("Use instance default (TTL)").click();
      popover().findByText("Custom").click();
      cy.findByDisplayValue("24").clear().type("48").blur();

      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(48);
      });
    });
  });

  it("should show the various Postgres SSL options correctly", () => {
    const confirmSSLFields = (visible, hidden) => {
      visible.forEach(field => cy.findByText(field));
      hidden.forEach(field => cy.findByText(field).should("not.exist"));
    };

    const ssl = "Use a secure connection (SSL)",
      sslMode = "SSL Mode",
      useClientCert = "Authenticate client certificate?",
      clientPemCert = "SSL Client Certificate (PEM)",
      clientPkcsCert = "SSL Client Key (PKCS-8/DER or PKCS-12)",
      sslRootCert = "SSL Root Certificate (PEM)";

    cy.visit("/admin/databases/create");
    chooseDatabase("PostgreSQL");
    // initially, all SSL sub-properties should be hidden
    confirmSSLFields(
      [ssl],
      [sslMode, useClientCert, clientPemCert, clientPkcsCert, sslRootCert],
    );

    toggleFieldWithDisplayName(ssl);
    // when ssl is enabled, the mode and "enable client cert" options should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert],
      [clientPemCert, clientPkcsCert, sslRootCert],
    );

    toggleFieldWithDisplayName(useClientCert);
    // when the "enable client cert" option is enabled, its sub-properties should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert, clientPemCert, clientPkcsCert],
      [sslRootCert],
    );

    selectFieldOption(sslMode, "verify-ca");
    // when the ssl mode is set to "verify-ca", then the root cert option should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert, clientPemCert, clientPkcsCert, sslRootCert],
      [],
    );
  });
});

function chooseDatabase(database) {
  selectFieldOption("Database type", database);
}

function isSyncOptionSelected(option) {
  // This is a really bad way to assert that the text element is selected/active. Can it be fixed in the FE code?
  cy.findByText(option).parent().should("have.class", "text-brand");
}
