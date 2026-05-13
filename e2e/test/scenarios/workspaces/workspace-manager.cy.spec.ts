import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const POSTGRES_DB_NAME = "Writable Postgres12";
const MYSQL_DB_NAME = "Writable MySQL8";

const PG_SCHEMA_A = "Domestic";
const PG_SCHEMA_B = "Wild";

const CONFIG_FILENAME = "config.yml";

describe("scenarios > workspaces > workspace manager", () => {
  describe("postgres (with schemas)", () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    });

    it("creates, edits, downloads config, and deletes a workspace with a Postgres database", () => {
      const workspaceName = "PG Workspace";

      cy.log("create the workspace");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.newButton().click();
      H.NewWorkspaceModal.nameInput().type(workspaceName);
      H.NewWorkspaceModal.createButton().click();
      H.WorkspacePage.get().should("be.visible");

      cy.log("add the writable Postgres database with one schema");
      H.WorkspaceDatabaseSection.addDatabaseButton().click();
      H.NewWorkspaceDatabaseModal.schemasInput().click();
      H.popover().findByRole("option", { name: PG_SCHEMA_A }).click();
      H.NewWorkspaceDatabaseModal.get().click();
      H.NewWorkspaceDatabaseModal.submitButton().click();

      H.WorkspaceDatabaseSection.database(POSTGRES_DB_NAME)
        .should("be.visible")
        .and("contain.text", PG_SCHEMA_A);

      cy.log("edit the database to include a second schema");
      H.WorkspaceDatabaseSection.databaseMenuButton(POSTGRES_DB_NAME).click();
      H.WorkspaceDatabaseSection.editMenuItem().click();
      H.UpdateWorkspaceDatabaseModal.schemasInput().click();
      H.popover().findByRole("option", { name: PG_SCHEMA_B }).click();
      H.UpdateWorkspaceDatabaseModal.get().click();
      H.UpdateWorkspaceDatabaseModal.saveButton().click();

      H.WorkspaceDatabaseSection.database(POSTGRES_DB_NAME)
        .should("contain.text", PG_SCHEMA_A)
        .and("contain.text", PG_SCHEMA_B);

      cy.log("download the workspace config");
      assertConfigDownloads();

      cy.log("remove the database from the workspace");
      H.WorkspaceDatabaseSection.databaseMenuButton(POSTGRES_DB_NAME).click();
      H.WorkspaceDatabaseSection.removeMenuItem().click();
      H.RemoveWorkspaceDatabaseModal.confirmButton().click();
      H.WorkspaceDatabaseSection.databaseList().should("not.exist");

      cy.log("delete the workspace");
      H.WorkspacePage.menuButton().click();
      H.WorkspacePage.deleteMenuItem().click();
      H.DeleteWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.get().should("be.visible");
      H.WorkspaceListPage.workspace(workspaceName).should("not.exist");
    });
  });

  describe("mysql (no schemas)", () => {
    beforeEach(() => {
      H.restore("mysql-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    it("creates, downloads config, and deletes a workspace with a MySQL database", () => {
      const workspaceName = "MySQL Workspace";

      cy.log("create the workspace");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.newButton().click();
      H.NewWorkspaceModal.nameInput().type(workspaceName);
      H.NewWorkspaceModal.createButton().click();
      H.WorkspacePage.get().should("be.visible");

      cy.log("add the writable MySQL database (no schemas to pick)");
      H.WorkspaceDatabaseSection.addDatabaseButton().click();
      // MySQL doesn't support schemas — the multi-select must not appear.
      H.NewWorkspaceDatabaseModal.schemasInput().should("not.exist");
      H.NewWorkspaceDatabaseModal.submitButton().click();

      H.WorkspaceDatabaseSection.database(MYSQL_DB_NAME).should("be.visible");

      cy.log("download the workspace config");
      assertConfigDownloads();

      cy.log("remove the database from the workspace");
      H.WorkspaceDatabaseSection.databaseMenuButton(MYSQL_DB_NAME).click();
      H.WorkspaceDatabaseSection.removeMenuItem().click();
      H.RemoveWorkspaceDatabaseModal.confirmButton().click();
      H.WorkspaceDatabaseSection.databaseList().should("not.exist");

      cy.log("delete the workspace");
      H.WorkspacePage.menuButton().click();
      H.WorkspacePage.deleteMenuItem().click();
      H.DeleteWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.get().should("be.visible");
      H.WorkspaceListPage.workspace(workspaceName).should("not.exist");
    });
  });
});

function assertConfigDownloads() {
  H.WorkspaceSetupSection.downloadConfigButton()
    .invoke("attr", "download")
    .should("eq", CONFIG_FILENAME);
  H.WorkspaceSetupSection.downloadConfigButton()
    .invoke("attr", "href")
    .should("match", /\/api\/ee\/workspace-manager\/\d+\/config$/);
}
