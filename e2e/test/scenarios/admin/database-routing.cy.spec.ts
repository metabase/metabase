import _ from "underscore";

import { QA_POSTGRES_PORT } from "e2e/support/cypress_data";
import type { DatabaseData } from "metabase-types/api";

const { H } = cy;

describe("admin > database > database routing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.restore("postgres-writable");

    cy.intercept("POST", "/api/ee/database-routing/mirror-database").as(
      "createMirrorDatabase",
    );
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
    cy.intercept("DELETE", "/api/database/*").as("deleteDatabase");
  });

  it.skip("should be able to configure db routing and manage destination databases", () => {
    // setup
    cy.visit("/admin/databases/2");
    cy.log("disable model actions");
    cy.findByLabelText("Model actions").click({ force: true });

    // enabling
    cy.log("should be able to turn the feature on");
    cy.findByLabelText("Enable database routing")
      .should("not.be.checked")
      .click({ force: true }); // mantine toggle hides the real input
    cy.findByRole("button", { name: /Add/ }).should("be.disabled");
    cy.findByTestId("db-routing-user-attribute").click();
    H.popover().findByText("attr_uid").click();
    H.undoToast().within(() => {
      cy.findByText("Database routing enabled").should("exist");
      cy.icon("close").click();
    });

    // configuring
    cy.log("should be able to change the user attribute routed on");
    cy.findByTestId("db-routing-user-attribute").click();
    H.popover().findByText("role").click();
    H.undoToast().within(() => {
      cy.findByText("Database routing updated").should("exist");
      cy.icon("close").click();
    });

    // database creation
    cy.log("should be able to create a destination databases");
    dbRoutingSection().findByText("No destination databases added yet");
    cy.findByRole("link", { name: /Add/ }).click();

    H.modal().within(() => {
      cy.log("should not allow changing engine");
      cy.findByLabelText("Database type").should("not.exist");

      H.typeAndBlurUsingLabel("Display name", "Destination DB 1");
      H.typeAndBlurUsingLabel("Host", "localhost");
      H.typeAndBlurUsingLabel("Port", QA_POSTGRES_PORT);
      H.typeAndBlurUsingLabel("Database name", "sample");
      H.typeAndBlurUsingLabel("Username", "metabase");
      H.typeAndBlurUsingLabel("Password", "metasample123");

      cy.button("Save").click();
      cy.wait("@createMirrorDatabase");
    });
    H.undoToast().within(() => {
      cy.findByText("Destination database created successfully").should(
        "exist",
      );
      cy.icon("close").click();
    });
    dbRoutingSection().within(() => {
      cy.findByText("Destination DB 1");
      cy.findByTestId("destination-db-health-info").realHover();
    });
    H.tooltip().should("contain.text", "Connected");

    // TODO: add a check that you can't create another db with the same name once BE implements it

    // bulk creation via api (this is how we expect most users to create destination dbs)
    cy.log("should be able to bulk create destination dbs via API");
    createMirrorDatabasesViaAPI({
      router_database_id: 2,
      mirrors: _.range(2, 7).map(i => ({
        ...BASE_POSTGRES_MIRROR_DB_INFO,
        name: `Destination DB ${i}`,
      })),
    });
    cy.reload();
    dbRoutingSection().within(() => {
      cy.icon("chevrondown").click();
      cy.findByText("Destination DB 5").should("exist");
      cy.findByText("Destination DB 6").should("not.exist");
    });

    // view all destination databases
    cy.log("should be able to see full list of destination databases");
    dbRoutingSection().findByText("View all 6").click();
    H.modal().within(() => {
      cy.findByText("Destination DB 6").should("exist");
      cy.button("Close").click();
    });

    // update destination database
    dbRoutingSection()
      .findAllByTestId("destination-db-list-item")
      .first()
      .icon("ellipsis")
      .click();
    H.popover().findByText("Edit").click();
    H.modal().within(() => {
      H.typeAndBlurUsingLabel("Display name", " Destination DB 1 Updated");
      cy.button("Save changes").click();
      cy.wait("@databaseUpdate");
    });
    H.undoToast().within(() => {
      cy.findByText("Destination database updated successfully").should(
        "exist",
      );
      cy.icon("close").click();
    });

    // remove a database
    cy.log("should be able to remove a routed database");
    dbRoutingSection()
      .findAllByTestId("destination-db-list-item")
      .first()
      .icon("ellipsis")
      .click();
    H.popover().findByText("Remove").click();
    H.modal().within(() => {
      cy.findByTestId("database-name-confirmation-input").type(
        "Destination DB 1 Updated",
      );
      cy.button("Delete").click();
      cy.wait("@deleteDatabase");
    });
    dbRoutingSection()
      .findByText("Destination DB 1 Updated")
      .should("not.exist");

    // turn off routing
    cy.log("should be able to turn the feature off");
    cy.findByLabelText("Enable database routing")
      .should("be.checked")
      .click({ force: true }); // mantine toggle hides the real input
    cy.findByLabelText("Enable database routing").should("not.be.checked");
    H.undoToast().within(() => {
      cy.findByText("Database routing disabled").should("exist");
      cy.icon("close").click();
    });

    // TODO: add a check that the list of databases is still preserved
  });

  it.skip("should not leak destinations databases in the application", () => {
    cy.log("setup db routing via API");
    configurDbRoutingViaAPI({
      router_database_id: 2,
      user_attribute: "role",
    });
    createMirrorDatabasesViaAPI({
      router_database_id: 2,
      mirrors: [BASE_POSTGRES_MIRROR_DB_INFO],
    });

    cy.log("validate setup was successful");
    cy.visit("/admin/databases/2");
    cy.findByLabelText("Enable database routing").should("be.checked");
    dbRoutingSection().within(() => {
      cy.icon("chevrondown").click();
      cy.findByText(BASE_POSTGRES_MIRROR_DB_INFO.name).should("exist");
    });

    cy.log("should not see destination databases in admin list of database");
    cy.visit("/admin/databases");
    cy.findAllByTestId("database-list")
      .findByText(BASE_POSTGRES_MIRROR_DB_INFO.name)
      .should("not.exist");

    cy.log("should not see destination databases in database browser");
    cy.visit("/browse/databases");
    cy.findAllByTestId("database-browser")
      .findByText(BASE_POSTGRES_MIRROR_DB_INFO.name)
      .should("not.exist");

    // TODO: uncomment once BE no longer returns the results
    // cy.log("should not see destination databases in search");
    // H.commandPaletteSearch(BASE_POSTGRES_MIRROR_DB_INFO.name, false);
    // H.commandPalette()
    //   .findByText("No results for “Destination DB”")
    //   .should("exist");
  });

  it("should interact with other settings correctly", () => {});
  // - [ ] should not be able to turn db routing on if other conflicting features are enabled
  // - [ ] should not be able to turn coflicting features on if db routing is enabled

  it.skip("should show db routing settings in the right circumstances", () => {});
  // - [ ] should not show for users w/o the token feature
  // - [ ] should show for admins
  // - [ ] should show for users w/ db management permissions
  // - [ ] should not show the feature if database is an attached dwh
});

function dbRoutingSection() {
  return cy.findByTestId("database-routing-section");
}

const BASE_POSTGRES_MIRROR_DB_INFO = {
  is_on_demand: false,
  is_full_sync: true,
  is_sample: false,
  cache_ttl: null,
  refingerprint: false,
  auto_run_queries: true,
  schedules: {},
  details: {
    host: "localhost",
    port: QA_POSTGRES_PORT,
    dbname: "sample",
    user: "metabase",
    "use-auth-provider": false,
    password: "metasample123",
    "schema-filters-type": "all",
    ssl: false,
    "tunnel-enabled": false,
    "advanced-options": false,
  },
  name: "Destination DB",
  engine: "postgres",
};

function configurDbRoutingViaAPI({
  router_database_id,
  user_attribute,
}: {
  router_database_id: number;
  user_attribute: string | null;
}) {
  cy.request(
    "PUT",
    `/api/ee/database-routing/router-database/${router_database_id}`,
    { user_attribute },
  );
}

function createMirrorDatabasesViaAPI({
  router_database_id,
  mirrors,
}: {
  router_database_id: number;
  mirrors: DatabaseData[];
}) {
  cy.request("POST", "/api/ee/database-routing/mirror-database", {
    router_database_id,
    mirrors,
  });
}
