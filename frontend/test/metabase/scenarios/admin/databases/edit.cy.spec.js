import { signInAsAdmin, snapshot, restore } from "__support__/cypress";

describe("admin > databases > edit", () => {
  before(snapshot);
  after(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
    cy.route("GET", "/api/database/*").as("databaseGet");
    cy.route("PUT", "/api/database/*").as("databaseUpdate");
  });

  describe("Connection tab", () => {
    it("shows the connection settings for sample dataset correctly", () => {
      cy.visit("/admin/databases/1");
      cy.get(`input[name="name"]`).should("have.value", "Sample Dataset");
      cy.get(`input[name="db"]`).should($input =>
        expect($input[0].value).to.match(/sample-dataset\.db/),
      );
    });

    it("lets you modify the connection settings", () => {
      cy.visit("/admin/databases/1");

      cy.contains("let me choose when Metabase syncs and scans")
        .closest(".Form-field")
        .find("a")
        .click();

      cy.contains("button", "Save").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.details["let-user-control-scheduling"]).to.equal(
          true,
        ),
      );

      cy.contains("Successfully saved!");

      // contains the tabs
      cy.reload();
      cy.contains("Connection");
      cy.contains("Scheduling");
    });
  });

  describe("Scheduling tab", () => {
    it("shows the initial scheduling settings correctly", () => {
      cy.visit("/admin/databases/1");

      cy.contains("Scheduling").click();

      cy.contains("Database syncing")
        .parent()
        .contains(".AdminSelect", "Hourly");

      cy.contains("Regularly, on a schedule")
        .closest("div")
        .should("have.class", "text-brand");
    });

    it("lets you change the metadata_sync period", () => {
      cy.visit("/admin/databases/1");

      cy.contains("Scheduling").click();

      cy.contains("Database syncing")
        .parent()
        .as("sync");

      cy.get("@sync")
        .contains(".AdminSelect", "Hourly")
        .click();
      cy.get(".PopoverBody")
        .contains("Daily")
        .click({ force: true });

      cy.contains("Regularly, on a schedule")
        .closest("div")
        .should("have.class", "text-brand");

      cy.contains("button", "Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) =>
        expect(response.body.schedules.metadata_sync.schedule_type).to.equal(
          "daily",
        ),
      );
    });

    it("lets you change the cache_field_values perid", () => {
      cy.visit("/admin/databases/1");
      cy.contains("Scheduling").click();

      cy.contains("Scanning")
        .parent()
        .as("scan");

      cy.get("@scan")
        .contains("Daily")
        .click();
      cy.get(".PopoverBody")
        .contains("Weekly")
        .click({ force: true });

      cy.contains("button", "Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(
          response.body.schedules.cache_field_values.schedule_type,
        ).to.equal("weekly");
      });
    });

    it("lets you change the cache_field_values to 'Only when adding a new filter widget'", () => {
      cy.visit("/admin/databases/1");
      cy.contains("Scheduling").click();

      cy.contains("Only when adding a new filter widget").click();
      cy.contains("button", "Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(response.body.is_full_sync).to.equal(false);
        expect(response.body.is_on_demand).to.equal(true);
      });
    });

    it("lets you change the cache_field_values to Never", () => {
      cy.visit("/admin/databases/1");
      cy.contains("Scheduling").click();

      cy.contains("Never").click();
      cy.contains("button", "Save changes").click();
      cy.wait("@databaseUpdate").then(({ response }) => {
        expect(response.body.is_full_sync).to.equal(false);
        expect(response.body.is_on_demand).to.equal(false);
      });
    });
  });

  describe.only("Actions sidebar", () => {
    it("lets you trigger the manual database schema sync", () => {
      cy.route("POST", "/api/database/1/sync_schema").as("sync_schema");

      cy.visit("/admin/databases/1");
      cy.contains("Sync database schema now").click();
      cy.wait("@sync_schema");
      cy.contains("Sync triggered!");
    });

    it("lets you trigger the manual rescan of field values", () => {
      cy.route("POST", "/api/database/1/rescan_values").as("rescan_values");

      cy.visit("/admin/databases/1");
      cy.contains("Re-scan field values now").click();
      cy.wait("@rescan_values");
      cy.contains("Scan triggered!");
    });

    it("lets you discard saved field values", () => {
      cy.route("POST", "/api/database/1/discard_values").as("discard_values");

      cy.visit("/admin/databases/1");
      cy.contains("Discard saved field values").click();
      cy.contains("button", "Yes").click();
      cy.wait("@discard_values");
    });

    it("lets you remove the Sample Dataset", () => {
      cy.route("DELETE", "/api/database/1").as("delete");

      cy.visit("/admin/databases/1");
      cy.contains("Remove this database").click();
      cy.get(".ModalBody input").type("DELETE");
      cy.get(".ModalBody")
        .contains("button", "Delete")
        .click();
      cy.wait("@delete");
      cy.url().should("match", /\/admin\/databases\/$/);
    });
  });
});
