import { signInAsAdmin, restore, popover, modal } from "__support__/cypress";

describe("scenarios > admin > databases > edit", () => {
  before(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
    cy.route("GET", "/api/database/*").as("databaseGet");
    cy.route("PUT", "/api/database/*").as("databaseUpdate");
  });

  describe("Connection tab", () => {
    it("shows the connection settings for sample dataset correctly", () => {
      cy.visit("/admin/databases/1");
      cy.findByLabelText("Name").should("have.value", "Sample Dataset");
      cy.findByLabelText("Connection String").should($input =>
        expect($input[0].value).to.match(/sample-dataset\.db/),
      );
    });

    it("lets you modify the connection settings", () => {
      cy.visit("/admin/databases/1");

      cy.findByLabelText(
        "This is a large database, so let me choose when Metabase syncs and scans",
      ).click();

      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.details["let-user-control-scheduling"]).to.equal(
          true,
        ),
      );

      cy.findByText("Success");

      // findByText the tabs
      cy.reload();
      cy.findByText("Connection");
      cy.findByText("Scheduling");
    });
  });

  describe("Scheduling tab", () => {
    it("shows the initial scheduling settings correctly", () => {
      cy.visit("/admin/databases/1");

      cy.findByText("Scheduling").click();

      cy.findByText("Database syncing")
        .parent()
        .findByText("Hourly");

      cy.findByText("Regularly, on a schedule")
        .closest("div")
        .should("have.class", "text-brand");
    });

    it("lets you change the metadata_sync period", () => {
      cy.visit("/admin/databases/1");

      cy.findByText("Scheduling").click();

      cy.findByText("Database syncing")
        .parent()
        .as("sync");

      cy.get("@sync")
        .findByText("Hourly")
        .click();
      popover().within(() => {
        cy.findByText("Daily").click({ force: true });
      });

      cy.findByText("Regularly, on a schedule")
        .closest("div")
        .should("have.class", "text-brand");

      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.schedules.metadata_sync.schedule_type).to.equal(
          "daily",
        ),
      );
    });

    it("lets you change the cache_field_values perid", () => {
      cy.visit("/admin/databases/1");
      cy.findByText("Scheduling").click();

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
      cy.visit("/admin/databases/1");
      cy.findByText("Scheduling").click();

      cy.findByText("Only when adding a new filter widget").click();
      cy.findByText("Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(response.body.is_full_sync).to.equal(false);
        expect(response.body.is_on_demand).to.equal(true);
      });
    });

    it("lets you change the cache_field_values to Never", () => {
      cy.visit("/admin/databases/1");
      cy.findByText("Scheduling").click();

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
      cy.route("POST", "/api/database/1/sync_schema").as("sync_schema");

      cy.visit("/admin/databases/1");
      cy.findByText("Sync database schema now").click();
      cy.wait("@sync_schema");
      cy.findByText("Sync triggered!");
    });

    it("lets you trigger the manual rescan of field values", () => {
      cy.route("POST", "/api/database/1/rescan_values").as("rescan_values");

      cy.visit("/admin/databases/1");
      cy.findByText("Re-scan field values now").click();
      cy.wait("@rescan_values");
      cy.findByText("Scan triggered!");
    });

    it("lets you discard saved field values", () => {
      cy.route("POST", "/api/database/1/discard_values").as("discard_values");

      cy.visit("/admin/databases/1");
      cy.findByText("Discard saved field values").click();
      cy.findByText("Yes").click();
      cy.wait("@discard_values");
    });

    it("lets you remove the Sample Dataset", () => {
      cy.route("DELETE", "/api/database/1").as("delete");

      cy.visit("/admin/databases/1");
      cy.findByText("Remove this database").click();
      modal().within(() => {
        cy.get("input").type("DELETE");
        cy.get(".Button.Button--danger").click();
      });

      cy.wait("@delete");
      cy.url().should("match", /\/admin\/databases\/$/);
    });
  });
});
