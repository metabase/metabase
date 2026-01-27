import {
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  SAMPLE_DB_ID,
  WRITABLE_DB_CONFIG,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { visitDatabase, waitForDbSync } from "./helpers/e2e-database-helpers";

const { H } = cy;
const { IS_ENTERPRISE } = Cypress.env();
const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe(
  "admin > database > external databases > enable actions",
  { tags: ["@external", "@actions"] },
  () => {
    ["mysql", "postgres"].forEach((dialect) => {
      it(`should show ${dialect} writable_db with actions enabled`, () => {
        H.restore(`${dialect}-writable`);
        cy.signInAsAdmin();

        visitDatabase(WRITABLE_DB_ID).then(({ response: { body } }) => {
          expect(body.name).to.include("Writable");
          expect(body.name.toLowerCase()).to.include(dialect);

          expect(body.details.dbname).to.equal(
            WRITABLE_DB_CONFIG[dialect].connection.database,
          );
          expect(body.settings["database-enable-actions"]).to.eq(true);
        });

        cy.findByLabelText("Model actions").should("be.checked");
      });
    });
  },
);

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

  function mockUploadServiceAccountJSON(fileContents) {
    // create blob to act as selected file
    cy.get("input[type=file]")
      .then(async (input) => {
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
    // should display a setup help card
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Need help connecting?");

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
          cy.findByLabelText(/Rerun queries for simple explorations/).should(
            "have.attr",
            "data-checked",
            "true",
          );
          // Reproduces (metabase#14334)
          cy.findByText("Additional JDBC connection string options");
          // Reproduces (metabase#17450)
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

        editDatabase();

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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("MySQL").click({ force: true });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show advanced options").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Additional JDBC connection string options");

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

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.be.disabled").click();

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

describe("database page > side panel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.visit("/admin/databases/create");
  });

  it("should show side panel with help content when 'Help is here' is clicked", () => {
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
  });

  it("should update the side panel content when the engine is changed", () => {
    const enginesMap = [
      { name: "Amazon Athena", file: "athena" },
      { name: "BigQuery", file: "bigquery" },
      { name: "Amazon Redshift", file: "redshift" },
      { name: "ClickHouse", file: "clickhouse" },
      { name: "Databricks", file: "databricks" },
      { name: "Druid", file: "druid" },
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

describe("scenarios > admin > databases > exceptions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should handle malformed (null) database details (metabase#25715)", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`, (req) => {
      req.reply((res) => {
        res.body.details = null;
      });
    }).as("loadDatabase");

    cy.visit("/admin/databases/1");
    cy.wait("@loadDatabase");

    // It is unclear how this issue will be handled,
    // but at the very least it shouldn't render the blank page.
    cy.get("nav").should("contain", "Metabase Admin");
    // The response still contains the database name,
    // so there's no reason we can't display it.
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/Sample Database/i);
    // This seems like a reasonable CTA if the database is beyond repair.
    cy.button("Remove this database").should("not.be.disabled");
  });

  it("should handle is_attached_dwh databases", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`, (req) => {
      req.reply((res) => {
        res.body.details = null;
        res.body.is_attached_dwh = true;
      });
    }).as("loadDatabase");

    cy.visit("/admin/databases/1");
    cy.wait("@loadDatabase");

    cy.findByTestId("main-logo");
    cy.findByTestId("breadcrumbs").findByText("Sample Database");
    cy.findByTestId("database-connection-info-section")
      .findByRole("button", { name: "Edit connection details" })
      .should("be.disabled");
    cy.findByTestId("database-connection-info-section")
      .findByRole("button", { name: "Edit connection details" })
      .should("be.disabled")
      .trigger("mouseenter", { force: true });
    H.tooltip().findByText(
      "This database is managed by Metabase Cloud and cannot be modified.",
    );
    cy.findByTestId("database-actions-panel").should("not.exist");
  });

  it("should show error upon a bad request", () => {
    cy.intercept("POST", "/api/database", (req) => {
      req.reply({
        statusCode: 400,
        body: "DATABASE CONNECTION ERROR",
      });
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    H.typeAndBlurUsingLabel("Display name", "Test");
    H.typeAndBlurUsingLabel("Database name", "db");
    H.typeAndBlurUsingLabel("Username", "admin");

    cy.button("Save").click();
    cy.wait("@createDatabase");

    cy.findByTestId("database-form")
      .parent()
      .within(() => {
        cy.findByText("DATABASE CONNECTION ERROR").should("be.visible");
      });
  });

  it("should show specific error message when error is on host or port", () => {
    cy.intercept("POST", "/api/database", (req) => {
      req.reply({
        statusCode: 400,
        body: {
          message: "DATABASE CONNECTION ERROR",
          errors: {
            host: "Check your host",
            port: "Check your port",
          },
        },
      });
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    H.typeAndBlurUsingLabel("Display name", "Test");
    H.typeAndBlurUsingLabel("Database name", "db");
    H.typeAndBlurUsingLabel("Username", "admin");

    cy.button("Save").click();
    cy.wait("@createDatabase");

    cy.findByTestId("database-form")
      .parent()
      .within(() => {
        cy.findByText("DATABASE CONNECTION ERROR").should("not.exist");
        cy.findByText(
          /Make sure your Host and Port settings are correct/,
        ).should("be.visible");
      });
  });

  it("should handle non-existing databases (metabase#11037)", () => {
    cy.intercept("GET", "/api/database/999").as("loadDatabase");
    cy.visit("/admin/databases/999");
    cy.wait("@loadDatabase").then(({ response }) => {
      expect(response.statusCode).to.eq(404);
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    cy.findByRole("table").should("not.exist");
  });

  it("should handle a failure to `GET` the list of all databases (metabase#20471)", () => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    IS_ENTERPRISE && H.activateToken("pro-self-hosted");

    cy.intercept(
      {
        method: "GET",
        pathname: "/api/database",
        query: IS_ENTERPRISE
          ? {
              exclude_uneditable_details: "true",
            }
          : null,
      },
      (req) => {
        req.reply({
          statusCode: 500,
          body: { message: errorMessage },
        });
      },
    ).as("failedGet");

    cy.visit("/admin/databases");
    cy.wait("@failedGet");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Something.s gone wrong/);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      /We.ve run into an error\. You can try refreshing the page, or just go back\./,
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(errorMessage).should("not.be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show error details").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(errorMessage).should("be.visible");
  });
});

describe("scenarios > admin > databases > sample database", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
  });

  it("database settings", () => {
    visitDatabase(SAMPLE_DB_ID);

    cy.findAllByTestId("database-connection-info-section").should(
      "contain.text",
      "Connected",
    );

    editDatabase();

    // should not display a setup help card
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Need help connecting?").should("not.exist");

    cy.log(
      "should not be possible to change database type for the Sample Database (metabase#16382)",
    );
    cy.findByLabelText("Database type")
      .should("have.value", "H2")
      .and("be.disabled");

    cy.log("should correctly display connection settings");
    cy.findByLabelText("Display name").should("have.value", "Sample Database");
    cy.findByLabelText("Connection String")
      .should("have.attr", "value")
      .and("contain", "sample-database.db");

    cy.log("should be possible to modify the connection settings");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show advanced options").click();
    // `auto_run_queries` toggle should be ON by default
    cy.findByLabelText(/Rerun queries for simple explorations/)
      .should("have.attr", "data-checked", "true")
      .click({ force: true });
    // Reported failing in v0.36.4
    cy.log(
      "should respect the settings for automatic query running (metabase#13187)",
    );
    cy.findByLabelText(/Rerun queries for simple explorations/).should(
      "not.have.attr",
      "data-checked",
    );

    cy.log("change the metadata_sync period");
    cy.findByLabelText(/Choose when syncs and scans happen/).click({
      force: true,
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Hourly").click();
    H.popover().within(() => {
      cy.findByText("Daily").click({ force: true });
    });

    // "lets you change the cache_field_values period"
    cy.findByDisplayValue("Never, I'll do this manually if I need to")
      .should("be.visible")
      .click();

    H.popover().findByText("Regularly, on a schedule").click();
    cy.findAllByRole("button", { name: /Daily/ })
      .should("have.length", 2)
      .eq(1)
      .click();
    H.popover().findByText("Weekly").click();

    cy.button("Save changes").click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      editDatabase();
      expect(body.details["let-user-control-scheduling"]).to.equal(true);
      expect(body.schedules.metadata_sync.schedule_type).to.equal("daily");
      expect(body.schedules.cache_field_values.schedule_type).to.equal(
        "weekly",
      );
    });

    // "lets you change the cache_field_values to 'Only when adding a new filter widget'"
    cy.findByDisplayValue("Regularly, on a schedule").click();
    H.popover().findByText("Only when adding a new filter widget").click();
    cy.button("Save changes", { timeout: 10000 }).click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      editDatabase();
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(true);
    });

    // and back to never
    cy.findByDisplayValue("Only when adding a new filter widget").click();
    H.popover().findByText("Never, I'll do this manually if I need to").click();
    cy.button("Save changes", { timeout: 10000 }).click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      editDatabase();
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(false);
    });
  });

  it("allows to save the default schedule (metabase#57198)", () => {
    visitDatabase(SAMPLE_DB_ID);
    editDatabase();
    cy.findByRole("button", { name: /Show advanced options/ }).click();
    cy.findByLabelText(/Choose when syncs and scans happen/).click({
      force: true,
    });
    cy.button("Save changes").click();
    cy.wait("@databaseUpdate").then(({ request: { body }, response }) => {
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(false);
      // frontend sends wrong value but backend automatically corrects it for us:
      expect(response.body.schedules.cache_field_values).to.equal(null);
    });

    editDatabase();
    cy.findByDisplayValue("Never, I'll do this manually if I need to").click();
    H.popover().findByText("Regularly, on a schedule").click();
    cy.button("Save changes").click();
    cy.wait("@databaseUpdate").then(({ request: { body } }) => {
      expect(body.is_full_sync).to.equal(true);
      expect(body.is_on_demand).to.equal(false);
      expect(body.schedules.cache_field_values).to.deep.eq({
        schedule_day: "mon",
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      });
    });

    editDatabase();
    cy.findByDisplayValue("Regularly, on a schedule").click();
    H.popover().findByText("Only when adding a new filter widget").click();
    cy.button("Save changes").click();
    cy.wait("@databaseUpdate").then(({ request: { body } }) => {
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(true);
      expect(body.schedules.cache_field_values).to.equal(null);
    });
  });

  it("database actions", () => {
    cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/sync_schema`).as(
      "sync_schema",
    );
    cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/rescan_values`).as(
      "rescan_values",
    );
    cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/discard_values`).as(
      "discard_values",
    );
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/usage_info`).as(
      "usage_info",
    );
    cy.intercept("DELETE", `/api/database/${SAMPLE_DB_ID}`).as("delete");
    // model
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    // Create a segment through API
    H.createSegment({
      name: "Small orders",
      description: "All orders with a total under $100.",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    });

    // metric
    H.createQuestion({
      name: "Revenue",
      description: "Sum of orders subtotal",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    });

    visitDatabase(SAMPLE_DB_ID);

    // lets you trigger the manual database schema sync
    cy.button("Sync database schema").click();
    cy.wait("@sync_schema");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sync triggered!");

    // lets you trigger the manual rescan of field values
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Re-scan field values").click();
    cy.wait("@rescan_values");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Scan triggered!");

    // lets you discard saved field values
    cy.findByTestId("database-danger-zone-section")
      .as("danger")
      .within(() => {
        cy.button("Discard saved field values").click();
      });
    H.modal().within(() => {
      cy.findByRole("heading").should(
        "have.text",
        "Discard saved field values",
      );
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });
    cy.wait("@discard_values");

    // lets you remove the Sample Database
    cy.get("@danger").within(() => {
      cy.button("Remove this database").click();
      cy.wait("@usage_info");
    });

    H.modal().within(() => {
      cy.button("Delete this content and the DB connection")
        .as("deleteButton")
        .should("be.disabled");
      cy.findByLabelText(/Delete [0-9]* saved questions?/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByLabelText(/Delete [0-9]* models?/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByLabelText(/Delete [0-9]* metrics?/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByLabelText(/Delete [0-9]* segments?/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByText(
        "This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone!",
      );

      cy.get("@deleteButton").should("be.disabled");

      cy.findByPlaceholderText("Are you completely sure?")
        .type("Sample Database")
        .blur();

      cy.intercept("GET", "/api/database").as("fetchDatabases");
      cy.get("@deleteButton").should("be.enabled").click();
      cy.wait(["@delete", "@fetchDatabases"]);
    });

    cy.location("pathname").should("eq", "/admin/databases/"); // FIXME why the trailing slash?
    cy.intercept("POST", "/api/database/sample_database").as("sample_database");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Bring the sample database back", {
      timeout: 10000,
    }).click();
    cy.wait("@sample_database");

    cy.findAllByRole("cell").contains("Sample Database").click();
    const newSampleDatabaseId = SAMPLE_DB_ID + 1;
    cy.location("pathname").should(
      "eq",
      `/admin/databases/${newSampleDatabaseId}`,
    );
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
      cy.findByText("Delete this content and the DB connection").click();
      cy.wait("@deleteDatabase");
    });

    cy.findByTestId("database-list").within(() => {
      cy.findByText("Sample Database").should("not.exist");
    });

    cy.findByTestId("exit-admin").click();

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

    cy.findByTestId("exit-admin").click();

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

describe("add database card", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("should track the click on the card", () => {
    cy.visit("/browse/databases");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findByTestId("database-browser")
      .findAllByRole("link")
      .last()
      .as("addDatabaseCard");

    cy.get("@addDatabaseCard").findByText("Add a database").click();
    cy.location("pathname").should("eq", "/admin/databases/create");
    H.expectUnstructuredSnowplowEvent({
      event: "database_add_clicked",
      triggered_from: "db-list",
    });
  });
});

function editDatabase() {
  cy.findByTestId("database-connection-info-section")
    .findByRole("button", { name: "Edit connection details" })
    .click();
}
