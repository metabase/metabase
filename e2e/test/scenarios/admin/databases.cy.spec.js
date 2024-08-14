import {
  WRITABLE_DB_ID,
  WRITABLE_DB_CONFIG,
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  SAMPLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  typeAndBlurUsingLabel,
  isEE,
  setTokenFeatures,
  modal,
  tooltip,
} from "e2e/support/helpers";
import { createSegment } from "e2e/support/helpers/e2e-table-metadata-helpers";

import { visitDatabase } from "./helpers/e2e-database-helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe(
  "admin > database > external databases > enable actions",
  { tags: ["@external", "@actions"] },
  () => {
    ["mysql", "postgres"].forEach(dialect => {
      it(`should show ${dialect} writable_db with actions enabled`, () => {
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();

        visitDatabase(WRITABLE_DB_ID).then(({ response: { body } }) => {
          expect(body.name).to.include("Writable");
          expect(body.name.toLowerCase()).to.include(dialect);

          expect(body.details.dbname).to.equal(
            WRITABLE_DB_CONFIG[dialect].connection.database,
          );
          expect(body.settings["database-enable-actions"]).to.eq(true);
        });

        cy.get("#model-actions-toggle").should(
          "have.attr",
          "aria-checked",
          "true",
        );
      });
    });
  },
);

describe("admin > database > add", () => {
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
      if (
        response.body.data.some(db => db.initial_sync_status !== "complete")
      ) {
        waitForDbSync(maxRetries - 1);
      }
    });
  }

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

          // make sure tooltips behave as expected
          cy.findByLabelText("Host").parent().icon("info").realHover();
        });

        tooltip()
          .findByText(/your databases ip address/i)
          .should("be.visible");

        cy.findByTestId("database-form").within(() => {
          cy.findByLabelText("Port")
            .parent()
            .within(() => {
              cy.icon("info").should("not.exist");
            });

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

describe("scenarios > admin > databases > exceptions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle malformed (null) database details (metabase#25715)", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`, req => {
      req.reply(res => {
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/Sample Database/i);
    // This seems like a reasonable CTA if the database is beyond repair.
    cy.button("Remove this database").should("not.be.disabled");
  });

  it("should show error upon a bad request", () => {
    cy.intercept("POST", "/api/database", req => {
      req.reply({
        statusCode: 400,
        body: "DATABASE CONNECTION ERROR",
      });
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Database name", "db");
    typeAndBlurUsingLabel("Username", "admin");

    cy.button("Save").click();
    cy.wait("@createDatabase");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  it("should handle non-existing databases (metabase#11037)", () => {
    cy.intercept("GET", "/api/database/999").as("loadDatabase");
    cy.visit("/admin/databases/999");
    cy.wait("@loadDatabase").then(({ response }) => {
      expect(response.statusCode).to.eq(404);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not found.");
    cy.findByRole("table").should("not.exist");
  });

  it("should handle a failure to `GET` the list of all databases (metabase#20471)", () => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    isEE && setTokenFeatures("all");

    cy.intercept(
      {
        method: "GET",
        pathname: "/api/database",
        query: isEE
          ? {
              exclude_uneditable_details: "true",
            }
          : null,
      },
      req => {
        req.reply({
          statusCode: 500,
          body: { message: errorMessage },
        });
      },
    ).as("failedGet");

    cy.visit("/admin/databases");
    cy.wait("@failedGet");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Something.s gone wrong/);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      /We.ve run into an error\. You can try refreshing the page, or just go back\./,
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(errorMessage).should("not.be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show error details").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(errorMessage).should("be.visible");
  });
});

describe("scenarios > admin > databases > sample database", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
  });

  it("database settings", () => {
    visitDatabase(SAMPLE_DB_ID);
    // should not display a setup help card
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Need help connecting?").should("not.exist");

    cy.log(
      "should not be possible to change database type for the Sample Database (metabase#16382)",
    );
    cy.findByLabelText("Database type")
      .should("have.text", "H2")
      .and("be.disabled");

    cy.log("should correctly display connection settings");
    cy.findByLabelText("Display name").should("have.value", "Sample Database");
    cy.findByLabelText("Connection String")
      .should("have.attr", "value")
      .and("contain", "sample-database.db");

    cy.log("should be possible to modify the connection settings");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show advanced options").click();
    // `auto_run_queries` toggle should be ON by default
    cy.findByLabelText("Rerun queries for simple explorations")
      .should("have.attr", "aria-checked", "true")
      .click();
    // Reported failing in v0.36.4
    cy.log(
      "should respect the settings for automatic query running (metabase#13187)",
    );
    cy.findByLabelText("Rerun queries for simple explorations").should(
      "have.attr",
      "aria-checked",
      "false",
    );

    cy.log("change the metadata_sync period");
    cy.findByLabelText("Choose when syncs and scans happen").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Hourly").click();
    popover().within(() => {
      cy.findByText("Daily").click({ force: true });
    });

    // "lets you change the cache_field_values period"
    cy.findByLabelText("Never, I'll do this manually if I need to").should(
      "have.attr",
      "aria-selected",
      "true",
    );

    cy.findByLabelText("Regularly, on a schedule")
      .click()
      .within(() => {
        cy.findByText("Daily").click();
      });
    popover().findByText("Weekly").click();

    cy.button("Save changes").click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      expect(body.details["let-user-control-scheduling"]).to.equal(true);
      expect(body.schedules.metadata_sync.schedule_type).to.equal("daily");
      expect(body.schedules.cache_field_values.schedule_type).to.equal(
        "weekly",
      );
    });
    cy.button("Success");

    // "lets you change the cache_field_values to 'Only when adding a new filter widget'"
    cy.findByLabelText("Only when adding a new filter widget").click();
    cy.button("Save changes", { timeout: 10000 }).click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(true);
    });

    // and back to never
    cy.findByLabelText("Never, I'll do this manually if I need to").click();
    cy.button("Save changes", { timeout: 10000 }).click();
    cy.wait("@databaseUpdate").then(({ response: { body } }) => {
      expect(body.is_full_sync).to.equal(false);
      expect(body.is_on_demand).to.equal(false);
    });
  });

  it("database actions sidebar", () => {
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
    createSegment({
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
    cy.createQuestion({
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
    cy.button("Sync database schema now").click();
    cy.wait("@sync_schema");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sync triggered!");

    // lets you trigger the manual rescan of field values
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Re-scan field values now").click();
    cy.wait("@rescan_values");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Scan triggered!");

    // lets you discard saved field values
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Danger Zone")
      .parent()
      .as("danger")
      .within(() => {
        cy.button("Discard saved field values").click();
      });
    modal().within(() => {
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

    modal().within(() => {
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    modal().within(() => {
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
