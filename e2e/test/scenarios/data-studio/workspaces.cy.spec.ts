import dedent from "ts-dedent";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardType,
  PythonTransformTableAliases,
  TransformTagId,
} from "metabase-types/api";

const { H } = cy;
const { Workspaces } = H;

const { ORDERS_ID } = SAMPLE_DATABASE;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";
const CUSTOM_SCHEMA = "custom_schema";

describe("scenarios > data studio > workspaces", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    // cy.intercept("PUT", "/api/field/*").as("updateField");
    // cy.intercept("POST", "/api/ee/transform").as("createTransform");
    // cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    // cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    // cy.intercept("DELETE", "/api/ee/transform/*/table").as(
    //   "deleteTransformTable",
    // );
    // cy.intercept("POST", "/api/ee/transform-tag").as("createTag");
    // cy.intercept("PUT", "/api/ee/transform-tag/*").as("updateTag");
    // cy.intercept("DELETE", "/api/ee/transform-tag/*").as("deleteTag");
  });

  // afterEach(() => {
  //   H.expectNoBadSnowplowEvents();
  // });

  describe("workspaces list", () => {
    it.only("should be able to create, navigate, and archive workspaces", () => {
      Workspaces.visitDataStudio();

      Workspaces.getWorkspacesSection()
        .findByText("No workspaces yet")
        .should("be.visible");

      Workspaces.getNewWorkspaceButton().click();
      H.modal().findByText("Create new workspace").should("be.visible");
      Workspaces.getNewWorkspaceNameInput().clear().type("My workspace");
      Workspaces.getNewWorkspaceDatabaseInput().click();
      H.popover().within(() => {
        // cy.findByText("Internal Metabase Database").should("not.exist"); // TODO: uncomment once it works
        // cy.findByText("Sample Database").should("not.exist"); // TODO: uncomment once it works
        cy.findByText("Writable Postgres12").should("be.visible").click();
      });
      H.modal().findByText("Create").click();

      cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);

      cy.log("shows workspace name");
      Workspaces.getWorkspaceNameInput()
        .should("be.visible")
        .and("have.value", "My workspace");

      Workspaces.getWorkspaceContent().within(() => {
        cy.log("starts on setup tab, and has only 2 tabs");
        H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);

        cy.log("shows workspace db");
        cy.findByText("Writable Postgres12").should("be.visible");

        cy.log("shows workspace setup logs");
        cy.findByText("Provisioning database isolation").should("be.visible");
        cy.findByText("Setting up the workspace").should("be.visible");
        cy.findByText("Workspace ready!").should("be.visible");
      });

      Workspaces.getWorkspaceSidebar().within(() => {
        cy.log("shows transforms list");
        cy.findByText("Workspace is empty").should("be.visible");
      });
    });
  });
});
