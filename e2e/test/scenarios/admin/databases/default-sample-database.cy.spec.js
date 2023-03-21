import { restore, popover, modal, describeEE } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("scenarios > admin > databases > sample database", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
  });

  it("database settings", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`).as("loadDatabase");
    cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
    cy.wait("@loadDatabase");
    // should not display a setup help card
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
      `usage_info`,
    );
    cy.intercept("DELETE", `/api/database/${SAMPLE_DB_ID}`).as("delete");
    cy.request("PUT", "/api/card/1", { dataset: true });

    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`).as("loadDatabase");
    cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
    cy.wait("@loadDatabase");

    // lets you trigger the manual database schema sync
    cy.button("Sync database schema now").click();
    cy.wait("@sync_schema");
    cy.findByText("Sync triggered!");

    // lets you trigger the manual rescan of field values
    cy.findByText("Re-scan field values now").click();
    cy.wait("@rescan_values");
    cy.findByText("Scan triggered!");

    // lets you discard saved field values
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
      cy.findByLabelText(/Delete [0-9]* saved questions/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByLabelText(/Delete [0-9]* models?/)
        .should("not.be.checked")
        .click()
        .should("be.checked");
      cy.findByText(
        "This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone!",
      );

      cy.get("@deleteButton").should("be.disabled");

      cy.findByPlaceholderText("Are you completely sure?").type(
        "Sample Database",
      );
      cy.get("@deleteButton").click();
      cy.wait("@delete");
    });

    // FIXME why the trailing slash?
    cy.location("pathname").should("eq", "/admin/databases/");
    cy.intercept("POST", "/api/database/sample_database").as("sample_database");
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

  describeEE("custom caching", () => {
    it("should set custom cache ttl", () => {
      cy.request("PUT", "api/setting/enable-query-caching", { value: true });

      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`).as("loadDatabase");
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.wait("@loadDatabase").then(({ response: { body } }) => {
        expect(body.cache_ttl).to.be.null;
      });

      cy.findByText("Show advanced options").click();

      setCustomCacheTTLValue("48");

      cy.button("Save changes").click();
      cy.wait("@databaseUpdate").then(({ request, response }) => {
        expect(request.body.cache_ttl).to.equal(48);
        expect(response.body.cache_ttl).to.equal(48);
      });

      function setCustomCacheTTLValue(value) {
        cy.findAllByTestId("select-button")
          .contains("Use instance default (TTL)")
          .click();

        popover().findByText("Custom").click();
        cy.findByDisplayValue("24").clear().type(value).blur();
      }
    });
  });
});
