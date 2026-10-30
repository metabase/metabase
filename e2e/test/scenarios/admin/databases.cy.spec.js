import {
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
} from "e2e/support/cypress_data";

import { waitForDbSync } from "./helpers/e2e-database-helpers";

const { H } = cy;
const IS_ENTERPRISE = Cypress.expose("IS_ENTERPRISE");

describe("admin > database > add", () => {
  function toggleFieldWithDisplayName(displayName) {
    cy.findByLabelText(new RegExp(displayName)).click({ force: true });
  }

  function selectFieldOption(fieldName, option) {
    cy.findByLabelText(fieldName).click();
    H.popover().contains(option).click({ force: true });
  }

  function chooseDatabase(database) {
    selectFieldOption("Database type", database);
  }

  function uploadServiceAccountJSON(fileContents) {
    cy.get("input[type=file]")
      .selectFile(
        {
          contents: Cypress.Buffer.from(fileContents),
          fileName: "service-account.json",
        },
        { force: true },
      )
      .trigger("blur", { force: true });
  }

  function mockSuccessfulDatabaseSave() {
    cy.intercept("POST", "/api/database", (req) => {
      req.reply({ statusCode: 200, body: { id: 42 }, delay: 100 });
    }).as("createDatabase");

    cy.button("Save").click();
    return cy.wait("@createDatabase");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/database").as("createDatabase");
    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/database/:id").as("getDatabase");

    cy.visit("/admin/databases/create");
    cy.log("should display a setup help link");
    cy.findByRole("link", { name: "Need help connecting?" }).should("exist");

    cy.findByLabelText("Database type").click();
  });

  describe("external databases", { tags: "@external" }, () => {
    describe("postgres", () => {
      beforeEach(() => {
        H.popover().within(() => {
          if (IS_ENTERPRISE) {
            // EE should ship with Oracle and Vertica as options
            cy.findByText("Oracle");
            cy.findByText("Vertica");
          }
        });

        H.popover().contains("PostgreSQL").click();

        cy.findByTestId("database-form").within(() => {
          cy.findByText("Show advanced options").click();
          cy.log("Reproduces metabase#14334");
          cy.findByLabelText(/Rerun queries for simple explorations/).should(
            "have.attr",
            "data-checked",
            "true",
          );
          cy.findByText("Additional JDBC connection string options");
          cy.log("Reproduces metabase#17450");
          cy.findByLabelText(/Choose when syncs and scans happen/)
            .click({ force: true })
            .should("have.attr", "data-checked", "true");

          cy.findByDisplayValue(
            "Never, I'll do this manually if I need to",
          ).should("exist");

          // make sure tooltips behave as expected
          cy.findByLabelText("Host")
            .parent()
            .icon("info")
            .trigger("mouseenter");
        });

        H.tooltip()
          .findByText(/your database's ip address/i)
          .should("be.visible");

        cy.findByTestId("database-form").within(() => {
          cy.findByLabelText("Port")
            .parent()
            .within(() => {
              cy.icon("info").should("not.exist");
            });

          // make sure fields needed to connect to the database are properly trimmed (metabase#12972)
          H.typeAndBlurUsingLabel(/Display name/, "QA Postgres12");
          H.typeAndBlurUsingLabel(/Host/, "localhost");
          H.typeAndBlurUsingLabel(/Port/, QA_POSTGRES_PORT);
          H.typeAndBlurUsingLabel(/Database name/, "sample");
          H.typeAndBlurUsingLabel(/Username/, "metabase");
          H.typeAndBlurUsingLabel(/Password/, "metasample123");
        });

        const confirmSSLFields = (visible, hidden) => {
          visible.forEach((field) => cy.findByText(new RegExp(field)));
          hidden.forEach((field) =>
            cy.findByText(new RegExp(field)).should("not.exist"),
          );
        };

        const ssl = "Use a secure connection \\(SSL\\)",
          sslMode = "SSL Mode",
          useClientCert = "Authenticate client certificate?",
          clientPemCert = "SSL Client Certificate \\(PEM\\)",
          clientPkcsCert = "SSL Client Key \\(PKCS-8/DER\\)",
          sslRootCert = "SSL Root Certificate \\(PEM\\)";

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

        cy.url().should("match", /\/admin\/databases\/\d/);

        waitForDbSync();
      });

      it("should add Postgres database and redirect to db info page (metabase#12972, metabase#14334, metabase#17450)", () => {
        cy.findByRole("status").within(() => {
          cy.findByText("Done!");
        });

        cy.findByRole("link", { name: "Manage permissions" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /Browse data/ }).should("be.visible");

        cy.findByTestId("database-header-section").should(
          "contain.text",
          "QA Postgres12",
        );

        cy.findAllByTestId("database-connection-info-section").should(
          "contain.text",
          "Connected",
        );

        cy.findByTestId("database-connection-info-section")
          .findByRole("button", { name: "Edit connection details" })
          .click();

        cy.findByLabelText(/Choose when syncs and scans happen/).should(
          "have.attr",
          "data-checked",
          "true",
        );

        cy.findByDisplayValue(
          "Never, I'll do this manually if I need to",
        ).should("exist");
      });
    });

    it(
      "should add Mongo database and redirect to db info page",
      { tags: "@mongo" },
      () => {
        H.popover().contains("MongoDB").click();

        H.typeAndBlurUsingLabel("Display name", "QA Mongo");
        H.typeAndBlurUsingLabel("Host", "localhost");
        H.typeAndBlurUsingLabel("Port", QA_MONGO_PORT);
        H.typeAndBlurUsingLabel("Database name", "sample");
        H.typeAndBlurUsingLabel("Username", "metabase");
        H.typeAndBlurUsingLabel("Password", "metasample123");
        H.typeAndBlurUsingLabel("Authentication database (optional)", "admin");

        cy.findByRole("button", { name: /Show advanced options/ }).click();
        cy.findByLabelText(
          "Additional connection string options (optional)",
        ).should("be.visible");

        cy.findByRole("button", { name: /Save/ })
          .should("not.be.disabled")
          .click();

        cy.wait("@createDatabase");

        cy.url().should("match", /\/admin\/databases\/\d/);

        cy.findByTestId("database-header-section").should(
          "contain.text",
          "QA Mongo",
        );

        cy.findByRole("status").within(() => {
          cy.findByText("Syncing…");
          cy.findByText("Done!");
        });

        cy.findByRole("link", { name: "Manage permissions" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /Browse data/ }).should("be.visible");
      },
    );

    it(
      "should add Mongo database via the connection string",
      { tags: "@mongo" },
      () => {
        const badDBString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}`;
        const badPasswordString = `mongodb://metabase:wrongPassword@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;
        const validConnectionString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;

        H.popover().findByText("MongoDB").click({ force: true });

        cy.findByTestId("database-form").within(() => {
          cy.findByLabelText("Use a connection string").click();
          H.typeAndBlurUsingLabel("Display name", "QA Mongo");
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
          cy.findByText(/Authentication failed/);
          cy.button("Failed");

          cy.findByLabelText("Paste your connection string")
            .clear()
            .type(validConnectionString);

          cy.button("Save", { timeout: 7000 })
            .should("not.be.disabled")
            .click();
        });

        cy.wait("@createDatabase");

        cy.url().should("match", /\/admin\/databases\/\d/);

        cy.findByTestId("database-header-section").should(
          "contain.text",
          "QA Mongo",
        );

        cy.findByRole("status").within(() => {
          cy.findByText("Syncing…");
          cy.findByText("Done!");
        });

        cy.findByRole("link", { name: "Manage permissions" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: /Browse data/ }).should("be.visible");
      },
    );

    it("should add MySQL database and redirect to db info page", () => {
      H.popover().findByText("MySQL").click();

      cy.findByTestId("database-form").within(() => {
        cy.findByRole("button", { name: /Show advanced options/ }).click();
        cy.findByLabelText("Additional JDBC connection string options").should(
          "be.visible",
        );
      });

      H.typeAndBlurUsingLabel("Display name", "QA MySQL8");
      H.typeAndBlurUsingLabel("Host", "localhost");
      H.typeAndBlurUsingLabel("Port", QA_MYSQL_PORT);
      H.typeAndBlurUsingLabel("Database name", "sample");
      H.typeAndBlurUsingLabel("Username", "metabase");
      H.typeAndBlurUsingLabel("Password", "metasample123");

      // Bypass the RSA public key error for MySQL database
      // https://github.com/metabase/metabase/issues/12545
      H.typeAndBlurUsingLabel(
        "Additional JDBC connection string options",
        "allowPublicKeyRetrieval=true",
      );

      cy.button("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\/\d/);

      cy.findByTestId("database-header-section").should(
        "contain.text",
        "QA MySQL8",
      );
      cy.findByRole("status").findByText("Syncing…").should("be.visible");
      cy.findByRole("status").findByText("Syncing…").should("not.exist");
      cy.findByRole("status").findByText("Done!").should("be.visible");

      cy.findByRole("link", { name: "Manage permissions" }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /Browse data/ }).should("be.visible");
    });
  });

  describe("Google service account JSON upload", () => {
    const serviceAccountJSON = '{"foo": 123}';

    it("should work for BigQuery", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("BigQuery");
      H.typeAndBlurUsingLabel("Display name", "BQ");
      selectFieldOption("Datasets", "Only these...");
      cy.findByPlaceholderText("E.x. public,auth*").type("foo");

      uploadServiceAccountJSON(serviceAccountJSON);
      mockSuccessfulDatabaseSave().then(({ request: { body } }) => {
        expect(body.details["service-account-json"]).to.equal(
          serviceAccountJSON,
        );
      });
    });
  });
});

describe("database page > side panel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.visit("/admin/databases/create");
  });

  it("should show side panel with help content and update it when the engine is changed", () => {
    cy.log(
      "should show side panel with help content when 'Help is here' is clicked",
    );
    cy.findByRole("button", { name: /Help is here/ }).click();
    cy.findByTestId("database-help-side-panel").within(() => {
      cy.findByText("Add PostgreSQL").should("be.visible");
      cy.findByRole("link", { name: /Read the full docs/ }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /Talk to an expert/ }).should("be.visible");
      cy.findByRole("button", { name: /Invite a teammate to help you/ }).should(
        "be.visible",
      );
    });
    cy.findByRole("button", { name: /Close panel/ }).click();
    cy.findByTestId("database-help-side-panel").should("not.exist");

    cy.log("should update the side panel content when the engine is changed");
    const enginesMap = [
      { name: "Amazon Athena", file: "athena" },
      { name: "BigQuery", file: "bigquery" },
      { name: "Amazon Redshift", file: "redshift" },
      { name: "ClickHouse", file: "clickhouse" },
      { name: "Databricks", file: "databricks" },
      { name: "Druid JDBC", file: "druid" },
      { name: "MongoDB", file: "mongo" },
      { name: "MySQL", file: "mysql" },
      { name: "PostgreSQL", file: "postgresql" },
      { name: "Presto", file: "presto" },
      { name: "SQL Server", file: "sql-server" },
      { name: "Snowflake", file: "snowflake" },
      { name: "Spark SQL", file: "sparksql" },
      { name: "Starburst (Trino)", file: "starburst" },
    ];

    for (const engineSpec of enginesMap) {
      cy.findByTestId("database-form").within(() => {
        cy.findByLabelText("Database type").click();
      });
      H.popover().contains(engineSpec.name).click();
      cy.findByRole("button", { name: /Help is here/ }).click();
      cy.findByTestId("database-help-side-panel").within(() => {
        cy.findByText("Add " + engineSpec.name).should("be.visible");
        cy.findByRole("link", { name: /Read the full docs/ })
          .should("have.attr", "href")
          .and("contain", engineSpec.file);

        // Check we don't have an error when loading the doc contents
        cy.findByRole("alert").should("not.exist");
        cy.contains("Failed to load detailed documentation").should(
          "not.exist",
        );
      });

      cy.findByRole("button", { name: /Close panel/ }).click();
      cy.findByTestId("database-help-side-panel").should("not.exist");
    }
  });
});

describe("scenarios > admin > databases > sample database", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("updates databases list in Browse databases after bringing sample database back", () => {
    cy.intercept("GET", "/api/database").as("loadDatabases");
    cy.intercept("POST", "/api/database/sample_database").as(
      "restoreSampleDatabase",
    );
    cy.intercept("GET", "/api/database/*/usage_info").as(
      "loadDatabaseUsageInfo",
    );
    cy.intercept("GET", "/api/database/*").as("loadDatabase");
    cy.intercept("DELETE", "/api/database/*").as("deleteDatabase");

    cy.visit("/admin/databases");
    cy.wait("@loadDatabases");
    cy.findByTestId("database-list").within(() => {
      cy.findByText("Sample Database").click();
    });
    cy.wait("@loadDatabase");

    cy.button("Remove this database").click();
    cy.wait("@loadDatabaseUsageInfo");
    H.modal().within(() => {
      cy.findByLabelText(/Delete \d+ saved questions?/).click();
      cy.findByLabelText(/Delete \d+ model?/).click();
      cy.findByTestId("database-name-confirmation-input").type(
        "Sample Database",
      );
      cy.findByText("Delete this DB connection").click();
      cy.wait("@deleteDatabase");
    });

    cy.findByTestId("database-list").within(() => {
      cy.findByText("Sample Database").should("not.exist");
    });

    H.goToMainApp();

    cy.wait("@loadDatabases");
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByLabelText("Browse databases").should("not.exist");
    });

    cy.visit("/admin/databases");
    cy.findByTestId("database-list").within(() => {
      cy.findByText("Bring the sample database back").click();
      cy.wait("@restoreSampleDatabase");
    });

    cy.findByTestId("database-list").within(() => {
      cy.findByText("Sample Database").should("exist");
    });

    H.goToMainApp();

    cy.wait("@loadDatabases");
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByLabelText("Browse databases").should("exist");
      cy.findByLabelText("Browse databases").click();
    });

    cy.findByTestId("database-browser").within(() => {
      cy.findByText("Sample Database").should("exist");
    });
  });
});
