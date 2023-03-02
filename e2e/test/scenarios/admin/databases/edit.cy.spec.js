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

  describe("Database type", () => {
    it("should be disabled for the Sample Dataset (metabase#16382)", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("H2").parentsUntil("a").should("be.disabled");
    });
  });

  describe("Connection settings", () => {
    it("shows the connection settings for sample database correctly", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByLabelText("Display name").should(
        "have.value",
        "Sample Database",
      );
      cy.findByLabelText("Connection String").should($input =>
        expect($input[0].value).to.match(/sample-database\.db/),
      );
    });

    it("lets you modify the connection settings", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.findByText("Show advanced options").click();
      cy.findByLabelText("Choose when syncs and scans happen").click();

      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.details["let-user-control-scheduling"]).to.equal(
          true,
        ),
      );

      cy.findByText("Success");
    });

    it("`auto_run_queries` toggle should be ON by default for `SAMPLE_DATABASE`", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.findByText("Show advanced options").click();
      cy.findByLabelText("Rerun queries for simple explorations").should(
        "have.attr",
        "aria-checked",
        "true",
      );
    });

    it("should respect the settings for automatic query running (metabase#13187)", () => {
      cy.log("Turn off `auto run queries`");
      cy.request("PUT", `/api/database/${SAMPLE_DB_ID}`, {
        auto_run_queries: false,
      });

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.log("Reported failing on v0.36.4");
      cy.findByText("Show advanced options").click();
      cy.findByLabelText("Rerun queries for simple explorations").should(
        "have.attr",
        "aria-checked",
        "false",
      );
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
  });

  describe("Scheduling settings", () => {
    beforeEach(() => {
      // Turn on scheduling without relying on the previous test(s)
      cy.request("PUT", `/api/database/${SAMPLE_DB_ID}`, {
        details: {
          "let-user-control-scheduling": true,
        },
        engine: "h2",
      });
    });

    it("shows the initial scheduling settings correctly", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.findByText("Show advanced options").click();
      cy.findByText("Regularly, on a schedule").should("exist");
      cy.findByText("Hourly").should("exist");
      cy.findByLabelText("Regularly, on a schedule").should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    it("lets you change the metadata_sync period", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);

      cy.findByText("Show advanced options").click();

      cy.findByText("Hourly").click();
      popover().within(() => {
        cy.findByText("Daily").click({ force: true });
      });

      cy.findByLabelText("Regularly, on a schedule").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.schedules.metadata_sync.schedule_type).to.equal(
          "daily",
        ),
      );
    });

    it("lets you change the cache_field_values perid", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Show advanced options").click();

      cy.findByText("Regularly, on a schedule")
        .parent()
        .parent()
        .within(() => {
          cy.findByText("Daily").click();
        });
      popover().within(() => {
        cy.findByText("Weekly").click({ force: true });
      });

      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(
          response.body.schedules.cache_field_values.schedule_type,
        ).to.equal("weekly");
      });
    });

    it("lets you change the cache_field_values to 'Only when adding a new filter widget'", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Show advanced options").click();

      cy.findByText("Only when adding a new filter widget").click();
      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(response.body.is_full_sync).to.equal(false);
        expect(response.body.is_on_demand).to.equal(true);
      });
    });

    it("lets you change the cache_field_values to Never", () => {
      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.findByText("Show advanced options").click();

      cy.findByText("Never, I'll do this manually if I need to").click();
      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(response.body.is_full_sync).to.equal(false);
        expect(response.body.is_on_demand).to.equal(false);
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

    it("should not display a setup help card", () => {
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`).as("loadDatabase");

      cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
      cy.wait("@loadDatabase");

      cy.findByText("Need help connecting?").should("not.exist");
    });
  });
});
