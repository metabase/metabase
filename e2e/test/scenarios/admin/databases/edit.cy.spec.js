import {
  restore,
  popover,
  modal,
  describeEE,
  mockSessionProperty,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("scenarios > admin > databases > edit", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
  });

  it("sample database", () => {
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

  describeEE("caching", () => {
    beforeEach(() => {
      mockSessionProperty("enable-query-caching", true);
    });

    it("allows to manage cache ttl", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.findByText("Show advanced options").click();
      cy.findByText("Use instance default (TTL)").click();
      popover().findByText("Custom").click();
      cy.findByDisplayValue("24").clear().type("32").blur();

      cy.button("Save changes").click();
      cy.wait("@databaseUpdate").then(({ request, response }) => {
        expect(request.body.cache_ttl).to.equal(32);
        expect(response.body.cache_ttl).to.equal(32);
      });

      cy.findByTextEnsureVisible("Custom").click();
      popover().findByText("Use instance default (TTL)").click();

      // We need to wait until "Success" button state is gone first
      cy.button("Save changes", { timeout: 10000 }).click();
      cy.wait("@databaseUpdate").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(null);
      });
    });
  });

  describe("Actions sidebar", () => {
    it("lets you trigger the manual database schema sync", () => {
      cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/sync_schema`).as(
        "sync_schema",
      );

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Sync database schema now").click();
      cy.wait("@sync_schema");
      cy.findByText("Sync triggered!");
    });

    it("lets you trigger the manual rescan of field values", () => {
      cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/rescan_values`).as(
        "rescan_values",
      );

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Re-scan field values now").click();
      cy.wait("@rescan_values");
      cy.findByText("Scan triggered!");
    });

    it("lets you discard saved field values", () => {
      cy.intercept("POST", `/api/database/${SAMPLE_DB_ID}/discard_values`).as(
        "discard_values",
      );

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Discard saved field values").click();
      cy.findByText("Yes").click();
      cy.wait("@discard_values");
    });

    it("lets you remove the Sample Database", () => {
      cy.intercept("DELETE", `/api/database/${SAMPLE_DB_ID}`).as("delete");
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/usage_info`).as(
        `usage_info`,
      );

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Remove this database").click();
      cy.wait("@usage_info");

      modal().within(() => {
        cy.findByLabelText(/Delete [0-9]* saved questions/).click();
        cy.findByPlaceholderText("Are you completely sure?").type(
          "Sample Database",
        );
        cy.get(".Button.Button--danger").click();
      });

      cy.wait("@delete");
      cy.url().should("match", /\/admin\/databases\/$/);
    });
  });
});
