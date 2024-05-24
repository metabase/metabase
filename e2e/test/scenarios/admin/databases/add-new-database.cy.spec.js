import {
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
} from "e2e/support/cypress_data";
import {
  restore,
  popover,
  typeAndBlurUsingLabel,
  isEE,
} from "e2e/support/helpers";

describe("admin > database > add", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/database").as("createDatabase");
    cy.intercept("GET", "/api/database").as("getDatabases");

    cy.visit("/admin/databases/create");
    // should display a setup help card
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Need help connecting?");

    cy.findByLabelText("Database type").click();
  });

  describe("external databases", { tags: "@external" }, () => {
    describe("postgres", () => {
      beforeEach(() => {
        popover().within(() => {
          if (isEE) {
            // EE should ship with Oracle and Vertica as options
            cy.findByText("Oracle");
            cy.findByText("Vertica");
          }
        });

        popover().contains("PostgreSQL").click({ force: true });

        cy.findByTestId("database-form").within(() => {
          cy.findByText("Show advanced options").click();
          cy.findByLabelText("Rerun queries for simple explorations").should(
            "have.attr",
            "aria-checked",
            "true",
          );
          // Reproduces (metabase#14334)
          cy.findByText("Additional JDBC connection string options");
          // Reproduces (metabase#17450)
          cy.findByLabelText("Choose when syncs and scans happen")
            .click()
            .should("have.attr", "aria-checked", "true");
          cy.findByLabelText(
            "Never, I'll do this manually if I need to",
          ).should("have.attr", "aria-selected", "true");

          // make sure fields needed to connect to the database are properly trimmed (metabase#12972)
          typeAndBlurUsingLabel("Display name", "QA Postgres12");
          typeAndBlurUsingLabel("Host", "localhost");
          typeAndBlurUsingLabel("Port", QA_POSTGRES_PORT);
          typeAndBlurUsingLabel("Database name", "sample");
          typeAndBlurUsingLabel("Username", "metabase");
          typeAndBlurUsingLabel("Password", "metasample123");
        });

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

        cy.url().should(
          "match",
          /\/admin\/databases\?created=true&createdDbId=\d$/,
        );

        waitForDbSync();
      });

      it("should add Postgres database and redirect to listing (metabase#12972, metabase#14334, metabase#17450)", () => {
        cy.findByRole("dialog").within(() => {
          cy.findByText(
            "Your database was added! Want to configure permissions?",
          ).should("exist");
          cy.button("Maybe later").click();
        });

        cy.findByRole("status").within(() => {
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

      it("should show a modal allowing you to redirect to the permissions page", () => {
        cy.findByRole("dialog").within(() => {
          cy.findByText(
            "Your database was added! Want to configure permissions?",
          ).should("exist");
          cy.findByRole("link", { name: "Configure permissions" }).click();
        });

        cy.findByTestId("permissions-editor").findByText(/QA Postgres12/);
      });
    });

    it(
      "should add Mongo database and redirect to listing",
      { tags: "@mongo" },
      () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("MongoDB").click({ force: true });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Show advanced options").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("Additional connection string options");

        typeAndBlurUsingLabel("Display name", "QA Mongo");
        typeAndBlurUsingLabel("Host", "localhost");
        typeAndBlurUsingLabel("Port", QA_MONGO_PORT);
        typeAndBlurUsingLabel("Database name", "sample");
        typeAndBlurUsingLabel("Username", "metabase");
        typeAndBlurUsingLabel("Password", "metasample123");
        typeAndBlurUsingLabel("Authentication database (optional)", "admin");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save").should("not.be.disabled").click();

        cy.wait("@createDatabase");

        cy.url().should(
          "match",
          /\/admin\/databases\?created=true&createdDbId=\d$/,
        );

        cy.findByRole("dialog").within(() => {
          cy.findByText(
            "Your database was added! Want to configure permissions?",
          ).should("exist");
          cy.button("Maybe later").click();
        });

        cy.findByRole("table").within(() => {
          cy.findByText("QA Mongo");
        });

        cy.findByRole("status").within(() => {
          cy.findByText("Syncing…");
          cy.findByText("Done!");
        });
      },
    );

    it(
      "should add Mongo database via the connection string",
      { tags: "@mongo" },
      () => {
        const badDBString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}`;
        const badPasswordString = `mongodb://metabase:wrongPassword@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;
        const validConnectionString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;

        popover().findByText("MongoDB").click({ force: true });

        cy.findByTestId("database-form").within(() => {
          cy.findByText("Paste a connection string").click();
          typeAndBlurUsingLabel("Display name", "QA Mongo");
          cy.findByLabelText("Port").should("not.exist");
          cy.findByLabelText("Paste your connection string").type(badDBString, {
            delay: 0,
          });

          cy.button("Save").should("not.be.disabled").click();
          cy.findByText(/No database name specified/);
          cy.button("Failed");

          cy.findByLabelText("Paste your connection string")
            .clear()
            .type(badPasswordString);

          cy.button("Save", { timeout: 7000 })
            .should("not.be.disabled")
            .click();
          cy.findByText(/Exception authenticating MongoCredential/);
          cy.button("Failed");

          cy.findByLabelText("Paste your connection string")
            .clear()
            .type(validConnectionString);

          cy.button("Save", { timeout: 7000 })
            .should("not.be.disabled")
            .click();
        });

        cy.wait("@createDatabase");

        cy.url().should(
          "match",
          /\/admin\/databases\?created=true&createdDbId=\d$/,
        );

        cy.findByRole("dialog").within(() => {
          cy.findByText(
            "Your database was added! Want to configure permissions?",
          ).should("exist");
          cy.button("Maybe later").click();
        });

        cy.findByRole("table").within(() => {
          cy.findByText("QA Mongo");
        });

        cy.findByRole("status").within(() => {
          cy.findByText("Syncing…");
          cy.findByText("Done!");
        });
      },
    );

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

      cy.url().should(
        "match",
        /\/admin\/databases\?created=true&createdDbId=\d$/,
      );

      cy.findByRole("dialog").within(() => {
        cy.findByText(
          "Your database was added! Want to configure permissions?",
        ).should("exist");
        cy.button("Maybe later").click();
      });

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

// we need to check for an indefinite number of these requests because we don't know how many polls it's going to take
function waitForDbSync(maxRetries = 10) {
  if (maxRetries === 0) {
    throw new Error("Timed out waiting for database sync");
  }
  cy.wait("@getDatabases").then(({ response }) => {
    if (response.body.data.some(db => db.initial_sync_status !== "complete")) {
      waitForDbSync(maxRetries - 1);
    }
  });
}
