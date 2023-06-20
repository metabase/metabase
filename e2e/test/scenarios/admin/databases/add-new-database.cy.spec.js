import {
  restore,
  popover,
  typeAndBlurUsingLabel,
  isEE,
} from "e2e/support/helpers";
import {
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
} from "e2e/support/cypress_data";

describe("admin > database > add", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/database").as("createDatabase");

    cy.visit("/admin/databases/create");
    // should display a setup help card
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Need help connecting?");

    cy.findByLabelText("Database type").click();
  });

  it("should add a new database", () => {
    popover().within(() => {
      if (isEE) {
        // EE should ship with Oracle and Vertica as options
        cy.findByText("Oracle");
        cy.findByText("Vertica");
      }
      cy.findByText("H2").click();
    });

    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Connection String", "invalid");

    // should surface an error if the connection string is invalid
    cy.button("Save").click();
    cy.wait("@createDatabase");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(": check your connection string");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Implicitly relative file paths are not allowed.");

    // should be able to recover from an error and add database with the correct connection string
    cy.findByDisplayValue("invalid")
      .clear()
      .type(
        "zip:./target/uberjar/metabase.jar!/sample-database.db;USER=GUEST;PASSWORD=guest",
        { delay: 0 },
      );
    cy.button("Save", { timeout: 10000 }).click();
    cy.wait("@createDatabase");
  });

  describe("external databases", { tags: "@external" }, () => {
    it("should add Postgres database and redirect to listing (metabase#12972, metabase#14334, metabase#17450)", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("PostgreSQL").click({ force: true });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show advanced options").click();

      // Reproduces (metabase#14334)
      cy.findByLabelText("Rerun queries for simple explorations").should(
        "have.attr",
        "aria-checked",
        "true",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Additional JDBC connection string options");
      // Reproduces (metabase#17450)
      cy.findByLabelText("Choose when syncs and scans happen")
        .click()
        .should("have.attr", "aria-checked", "true");

      cy.findByLabelText("Never, I'll do this manually if I need to").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      // make sure fields needed to connect to the database are properly trimmed (metabase#12972)
      typeAndBlurUsingLabel("Display name", "QA Postgres12");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_POSTGRES_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");

      const confirmSSLFields = (visible, hidden) => {
        visible.forEach(field => cy.findByText(field));
        hidden.forEach(field => cy.findByText(field).should("not.exist"));
      };

      const ssl = "Use a secure connection (SSL)",
        sslMode = "SSL Mode",
        useClientCert = "Authenticate client certificate?",
        clientPemCert = "SSL Client Certificate (PEM)",
        clientPkcsCert = "SSL Client Key (PKCS-8/DER)",
        sslRootCert = "SSL Root Certificate (PEM)";

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
        [
          ssl,
          sslMode,
          useClientCert,
          clientPemCert,
          clientPkcsCert,
          sslRootCert,
        ],
        [],
      );
      toggleFieldWithDisplayName(ssl);

      cy.button("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.details.host).to.equal("localhost");
        expect(request.body.details.dbname).to.equal("sample");
        expect(request.body.details.user).to.equal("metabase");
      });

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("We're taking a look at your database!");
      cy.findByLabelText("close icon").click();

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });

      cy.findByRole("table").within(() => {
        cy.findByText("QA Postgres12").click();
      });

      cy.findByLabelText("Choose when syncs and scans happen").should(
        "have.attr",
        "aria-checked",
        "true",
      );

      cy.findByLabelText("Never, I'll do this manually if I need to").should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    it("should add Mongo database and redirect to listing", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("MongoDB").click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show advanced options").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Additional connection string options");

      typeAndBlurUsingLabel("Display name", "QA Mongo4");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_MONGO_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");
      typeAndBlurUsingLabel("Authentication database (optional)", "admin");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA Mongo4");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });

    it("should add Mongo database via the connection string", () => {
      const connectionString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("MongoDB").click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Paste a connection string").click();
      typeAndBlurUsingLabel("Display name", "QA Mongo4");
      cy.findByLabelText("Port").should("not.exist");
      cy.findByLabelText("Paste your connection string").type(
        connectionString,
        {
          delay: 0,
        },
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA Mongo4");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });

    it("should add MySQL database and redirect to listing", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("MySQL").click({ force: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show advanced options").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Additional JDBC connection string options");

      typeAndBlurUsingLabel("Display name", "QA MySQL8");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_MYSQL_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");

      // Bypass the RSA public key error for MySQL database
      // https://github.com/metabase/metabase/issues/12545
      typeAndBlurUsingLabel(
        "Additional JDBC connection string options",
        "allowPublicKeyRetrieval=true",
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA MySQL8");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });
  });

  describe("Google service account JSON upload", () => {
    const serviceAccountJSON = '{"foo": 123}';

    it("should work for BigQuery", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("BigQuery");
      typeAndBlurUsingLabel("Display name", "BQ");
      selectFieldOption("Datasets", "Only these...");
      cy.findByPlaceholderText("E.x. public,auth*").type("some-dataset");

      mockUploadServiceAccountJSON(serviceAccountJSON);
      mockSuccessfulDatabaseSave().then(({ request: { body } }) => {
        expect(body.details["service-account-json"]).to.equal(
          serviceAccountJSON,
        );
      });
    });
  });
});

function toggleFieldWithDisplayName(displayName) {
  cy.findByLabelText(displayName).click();
}

function selectFieldOption(fieldName, option) {
  cy.findByLabelText(fieldName).click();
  popover().contains(option).click({ force: true });
}

function chooseDatabase(database) {
  selectFieldOption("Database type", database);
}

function mockUploadServiceAccountJSON(fileContents) {
  // create blob to act as selected file
  cy.get("input[type=file]")
    .then(async input => {
      const blob = await Cypress.Blob.binaryStringToBlob(fileContents);
      const file = new File([blob], "service-account.json");
      const dataTransfer = new DataTransfer();

      dataTransfer.items.add(file);
      input[0].files = dataTransfer.files;
      return input;
    })
    .trigger("change", { force: true })
    .trigger("blur", { force: true });
}

function mockSuccessfulDatabaseSave() {
  cy.intercept("POST", "/api/database", req => {
    req.reply({ statusCode: 200, body: { id: 42 }, delay: 100 });
  }).as("createDatabase");

  cy.button("Save").click();
  return cy.wait("@createDatabase");
}
