import _ from "underscore";

import {
  QA_POSTGRES_PORT,
  SAMPLE_DB_ID,
  USER_GROUPS,
} from "e2e/support/cypress_data";

import { interceptPerformanceRoutes } from "../performance/helpers/e2e-performance-helpers";

import {
  BASE_POSTGRES_DESTINATION_DB_INFO,
  configurDbRoutingViaAPI,
  createDestinationDatabasesViaAPI,
} from "./helpers/e2e-database-routing-helpers";

const { H } = cy;
const { ALL_USERS_GROUP } = USER_GROUPS;

describe("admin > database > database routing", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();

    cy.intercept(
      "POST",
      "/api/ee/database-routing/destination-database?check_connection_details=true",
    ).as("createDestinationDatabase");
    cy.intercept("PUT", "/api/database/*").as("databaseUpdate");
    cy.intercept("DELETE", "/api/database/*").as("deleteDatabase");
  });

  describe("EE", () => {
    beforeEach(() => {
      H.activateToken("pro-self-hosted");
    });

    it("should be able to configure db routing and manage destination databases", () => {
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

        H.typeAndBlurUsingLabel(/Slug/, "Destination DB 1");
        H.typeAndBlurUsingLabel(/Host/, "localhost");
        H.typeAndBlurUsingLabel(/Port/, QA_POSTGRES_PORT);
        H.typeAndBlurUsingLabel(/Database name/, "sample");
        H.typeAndBlurUsingLabel(/Username/, "metabase");
        H.typeAndBlurUsingLabel(/Password/, "metasample123");

        cy.button("Save").click();
        cy.wait("@createDestinationDatabase");
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

      cy.log("should validate destination db creation");
      cy.findByRole("link", { name: /Add/ }).click();

      H.modal().within(() => {
        cy.log("should prevent adding a db with the same name");
        H.typeAndBlurUsingLabel(/Slug/, "Destination DB 1");
        H.typeAndBlurUsingLabel(/Host/, "localhost");
        H.typeAndBlurUsingLabel(/Port/, QA_POSTGRES_PORT);
        H.typeAndBlurUsingLabel(/Database name/, "sample");
        H.typeAndBlurUsingLabel(/Username/, "metabase");
        H.typeAndBlurUsingLabel(/Password/, "metasample123");

        cy.button("Save").click();
        cy.wait("@createDestinationDatabase");
        cy.findByText("A destination database with that name already exists.");

        cy.log("should prevent adding with incorrect connection info");
        H.typeAndBlurUsingLabel(/Slug/, "Unique Destination DB Name");
        H.typeAndBlurUsingLabel(/Password/, "metasample124");
        cy.button(/(Failed|Save)/).click();
        cy.wait("@createDestinationDatabase");
        cy.findByText("Looks like your Password is incorrect.");

        cy.button("Cancel").click();
      });
      cy.findByTestId("leave-confirmation")
        .should("exist")
        .findByRole("button", { name: "Discard changes" })
        .click();
      H.modal().should("not.exist");

      // bulk creation via api (this is how we expect most users to create destination dbs)
      cy.log("should be able to bulk create destination dbs via API");
      createDestinationDatabasesViaAPI({
        router_database_id: 2,
        databases: _.range(2, 7).map((i) => ({
          ...BASE_POSTGRES_DESTINATION_DB_INFO,
          name: `Destination DB ${i}`,
        })),
      });
      cy.reload();
      dbRoutingSection().within(() => {
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
        H.typeAndBlurUsingLabel(/Slug/, " Destination DB 1 Updated");
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

      cy.log(
        "should not remove destination databases when turning the feature off",
      );
      expandDbRouting();
      dbRoutingSection().within(() => {
        cy.findByText("Destination DB 2").should("exist");
        cy.findByText("No destination databases added yet").should("not.exist");
      });
    });

    it("should not leak destinations databases in the application", () => {
      cy.log("setup db routing via API");
      cy.visit("/admin/databases/2");
      cy.log("disable model actions");
      cy.findByLabelText("Model actions").click({ force: true });
      configurDbRoutingViaAPI({
        router_database_id: 2,
        user_attribute: "role",
      });
      createDestinationDatabasesViaAPI({
        router_database_id: 2,
        databases: [BASE_POSTGRES_DESTINATION_DB_INFO],
      });

      cy.log("validate setup was successful");
      cy.reload();
      cy.findByLabelText("Enable database routing").should("be.checked");
      dbRoutingSection()
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("exist");

      cy.log("should not see destination databases in admin list of database");
      cy.visit("/admin/databases");
      cy.findAllByTestId("database-list")
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("not.exist");

      cy.log("should not see destination databases in database browser");
      cy.visit("/browse/databases");
      cy.findAllByTestId("database-browser")
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("not.exist");

      cy.log("should not see destination databases in search");
      H.commandPaletteSearch(BASE_POSTGRES_DESTINATION_DB_INFO.name, false);
      H.commandPalette()
        .findByText("No results for “DestinationDB”")
        .should("exist");

      cy.log("should not see database in table metadata db list");
      H.DataModel.visit();

      H.DataModel.TablePicker.getDatabase(
        BASE_POSTGRES_DESTINATION_DB_INFO.name,
      ).should("not.exist");

      cy.log("should not see database in permissions pages");
      cy.visit("/admin/permissions/data/database");
      cy.get("aside")
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("not.exist");

      cy.log("should not see database in data picker");
      cy.visit("/question/notebook");
      H.miniPicker()
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("not.exist");
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name).should(
          "not.exist",
        );
      });

      cy.log("shoudl not see database in data reference");
      H.startNewNativeQuestion();
      cy.findByTestId("sidebar-header").icon("chevronleft").click();
      cy.findByTestId("sidebar-header-title").should(
        "have.text",
        "Data Reference",
      );
      cy.findByTestId("sidebar-header-title")
        .findByText(BASE_POSTGRES_DESTINATION_DB_INFO.name)
        .should("not.exist");
    });

    it("should not allow turning on db routing on if other conflicting features are enabled", () => {
      cy.log("setup");
      setupModelPersistence();
      cy.visit("/admin/databases/2");

      cy.log("should be disabled if model actions is enabled");
      cy.findByLabelText("Model actions").should("be.checked");
      assertDbRoutingDisabled();

      cy.findByLabelText("Model actions").parent("label").click();

      assertDbRoutingNotDisabled();

      cy.log("should be disabled if model persistence is enabled");
      cy.findByLabelText("Model persistence")
        .should("not.be.checked")
        .parent("label")
        .click();

      assertDbRoutingDisabled();
      cy.findAllByTestId("database-model-features-section")
        .findByLabelText("Model persistence")
        .should("be.checked")
        .parent("label")
        .click();
      assertDbRoutingNotDisabled();

      cy.log("should be disabled if uploads are enabled for the database");
      cy.visit("/admin/settings/uploads");
      cy.findByLabelText("Upload Settings Form")
        .findByPlaceholderText("Select a database")
        .click();
      H.popover().findByText("Writable Postgres12").click();
      cy.findByLabelText("Upload Settings Form")
        .findByPlaceholderText("Select a schema")
        .click();

      H.popover().findByText("public").click();
      cy.findByLabelText("Upload Settings Form")
        .button("Enable uploads")
        .click();

      cy.visit("/admin/databases/2");
      assertDbRoutingDisabled();
    });

    it("should not allow turning conflicting features if db routing is enabled", () => {
      cy.log("setup");
      setupModelPersistence();
      cy.visit("/admin/databases/2");
      cy.findAllByTestId("database-model-features-section")
        .findByLabelText("Model actions")
        .click({ force: true });
      cy.findAllByTestId("database-model-features-section")
        .findByLabelText("Model actions")
        .should("not.be.checked");
      configurDbRoutingViaAPI({
        router_database_id: 2,
        user_attribute: "role",
      });
      cy.reload();

      cy.log("should not allow enabling model features");
      cy.findAllByTestId("database-model-features-section")
        .findByLabelText("Model actions")
        .trigger("mouseenter", { force: true });
      H.tooltip()
        .findByText(
          "Model actions can not be enabled if database routing is enabled.",
        )
        .should("exist");

      cy.findAllByTestId("database-model-features-section").within(() => {
        cy.findByLabelText("Model actions")
          .should("be.disabled")
          .should("not.be.checked");
        cy.findByLabelText("Model persistence")
          .should("be.disabled")
          .should("not.be.checked");
      });

      cy.log("should not allow enabling database for uploads");
      cy.visit("/admin/settings/uploads");
      cy.findByLabelText("Upload Settings Form")
        .findByPlaceholderText("Select a database")
        .click();
      H.popover()
        .findByText("Writable Postgres12 (DB Routing Enabled)")
        .closest('[data-combobox-option="true"]')
        .should("have.attr", "data-combobox-disabled", "true");
    });

    it("should highlight that a dabtabase has routing enabled on the permissions pages", () => {
      cy.log("setup");
      cy.request("PUT", "/api/database/2", {
        settings: { "database-enable-actions": false },
      });
      configurDbRoutingViaAPI({
        router_database_id: 2,
        user_attribute: "role",
      });

      cy.log("should highlight on group perms page at db level");
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
      cy.findByTestId("permission-table")
        .findByText("(Database routing enabled)")
        .should("exist");

      cy.log("should highlight on group perms page at table level");
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}/database/2`);
      cy.findByTestId("permissions-editor-breadcrumbs")
        .findByText("(Database routing enabled)")
        .should("exist");

      cy.log("should highlight on group perms page at table level");
      cy.visit("/admin/permissions/data/database/2");
      cy.findByTestId("permissions-editor-breadcrumbs")
        .findByText("(Database routing enabled)")
        .should("exist");
    });

    describe("feature visibility", () => {
      it("should only show db routing for valid database types", () => {
        cy.log("should not show for sample databases");
        cy.visit("/admin/databases/1");
        dbConnectionInfoSection().should("exist");
        dbRoutingSection().should("not.exist");

        cy.log("should not show for attached data warehouses");
        cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}`, (req) => {
          req.reply((res) => {
            res.body.is_attached_dwh = true;
            res.body.is_sample = false;
          });
        }).as("loadDatabase");
        cy.reload();
        dbConnectionInfoSection().should("exist");
        dbRoutingSection().should("not.exist");
      });

      it("should show for users with db management permissions but prevent removal of destination databases", () => {
        cy.log("setup - db routing");
        cy.visit("/admin/databases/2");
        cy.findAllByTestId("database-model-features-section")
          .findByLabelText("Model actions")
          .click({ force: true });
        configurDbRoutingViaAPI({
          router_database_id: 2,
          user_attribute: "role",
        });
        createDestinationDatabasesViaAPI({
          router_database_id: 2,
          databases: [BASE_POSTGRES_DESTINATION_DB_INFO],
        });

        cy.log("normal user should not see db routing");
        cy.signOut();
        cy.signInAsNormalUser();
        cy.visit("/admin/databases/2");
        cy.get("main").findByText(
          "Sorry, you don’t have permission to see that.",
        );

        cy.log("grant db management permissions to all users");
        cy.signOut();
        cy.signInAsAdmin();
        cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
        // NOTE: manage db permissions currently do not work in master w/o having create queries permissions
        // so we have to grant this permission in addition to db management
        const CREATE_QUERIES_PERMISSION_INDEX = 1;
        H.modifyPermission(
          "Writable Postgres12",
          CREATE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );
        const MANAGE_DATABASE_PERMISSION_INDEX = 4;
        H.modifyPermission(
          "Writable Postgres12",
          MANAGE_DATABASE_PERMISSION_INDEX,
          "Yes",
        );
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("normal user should see db");
        cy.signOut();
        cy.signIn("normal");
        cy.visit("/admin/databases/2");
        dbRoutingSection().should("exist");
        dbRoutingSection().within(() => {
          cy.log("should not be able to manage db routing settings");
          cy.findByLabelText("Enable database routing").should("be.disabled");
          cy.findByTestId("db-routing-user-attribute").should("be.disabled");
          cy.findByRole("button", { name: /Add/ }).should("not.exist");
        });

        cy.log("should be able to edit databases");
        dbRoutingSection()
          .findByTestId("destination-db-list-item")
          .icon("ellipsis")
          .click();
        H.popover().within(() => {
          cy.findByText("Remove").should("not.exist");
          cy.findByText("Edit").should("exist").click();
        });
        H.modal().within(() => {
          H.typeAndBlurUsingLabel(/Slug/, "Destination DB 1");
          cy.button("Save changes").click();
          cy.wait("@databaseUpdate");
        });
      });
    });
  });

  describe("OSS", { tags: ["@OSS"] }, () => {
    it("should not show the feature if not enabled in token features", () => {
      cy.visit("/admin/databases/2");
      dbConnectionInfoSection().should("exist");
      dbRoutingSection().should("not.exist");
    });
  });
});

function dbConnectionInfoSection() {
  return cy.findByTestId("database-connection-info-section");
}

function dbRoutingSection() {
  return cy.findByTestId("database-routing-section");
}

function expandDbRouting() {
  dbRoutingSection().within(() => {
    cy.icon("chevrondown").click();
  });
}

function assertDbRoutingNotDisabled() {
  dbRoutingSection().within(() => {
    cy.findByLabelText("Enable database routing")
      .should("not.be.disabled")
      .realHover();
  });
  H.tooltip().should("not.contain", /Database routing can't be enabled if/);
}

function assertDbRoutingDisabled() {
  dbRoutingSection().within(() => {
    cy.findByLabelText("Enable database routing")
      .should("not.be.checked")
      .should("be.disabled")
      .realHover();
  });
  H.tooltip()
    .findByText(/Database routing can't be enabled if/)
    .should("exist");
}

function setupModelPersistence() {
  interceptPerformanceRoutes();
  cy.visit("/admin/performance/models");
  cy.findByTestId("admin-layout-content").findByText("Disabled").click();
  cy.wait("@enablePersistence");
}
