import path from "path";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const CONFIG_FILENAME = "config.yml";

describe("scenarios > workspaces > workspace manager", () => {
  describe("postgres (with schemas)", () => {
    const POSTGRES_DB_NAME = "Writable Postgres12";
    const PG_SCHEMA_A = "Domestic";
    const PG_SCHEMA_B = "Wild";
    const workspaceName = "PG Workspace";
    const renamedName = "Renamed PG Workspace";

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      enableWorkspaces(WRITABLE_DB_ID);
      cy.deleteDownloadsFolder();
    });

    it("creates, renames, downloads config, and deletes a workspace as admin", () => {
      cy.log(
        "create the workspace from the empty state, databases added at once",
      );
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.newButton().click();
      H.NewWorkspaceModal.nameInput().type(workspaceName);
      H.NewWorkspaceModal.databaseCheckbox(POSTGRES_DB_NAME).click();
      H.NewWorkspaceModal.createButton().click();

      cy.log("the database (with all of its schemas) is attached at once");
      H.WorkspaceListPage.workspace(workspaceName)
        .should("be.visible")
        .and("contain.text", POSTGRES_DB_NAME);

      cy.log("rename the workspace via the menu");
      H.WorkspaceListPage.workspaceMenuButton(workspaceName).click();
      H.WorkspaceListPage.renameMenuItem().click();
      H.RenameWorkspaceModal.nameInput().clear().type(renamedName);
      H.RenameWorkspaceModal.renameButton().click();
      H.WorkspaceListPage.workspace(renamedName).should("be.visible");

      cy.log("download the workspace config via the menu");
      H.WorkspaceListPage.workspaceMenuButton(renamedName).click();
      H.WorkspaceListPage.downloadConfigMenuItem().click();
      cy.verifyDownload(CONFIG_FILENAME, { timeout: 15000 });
      readConfig().should((contents) => {
        expect(contents).to.contain(renamedName);
        expect(contents).to.contain(POSTGRES_DB_NAME);
        expect(contents).to.contain("postgres");
        expect(contents).to.contain(PG_SCHEMA_A);
        expect(contents).to.contain(PG_SCHEMA_B);
      });

      cy.log("delete the workspace via the menu");
      H.WorkspaceListPage.workspaceMenuButton(renamedName).click();
      H.WorkspaceListPage.deleteMenuItem().click();
      H.DeleteWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.workspaceList().should("not.exist");
      H.WorkspaceListPage.newButton().should("be.visible");
    });
  });

  describe("mysql (no schemas)", () => {
    const MYSQL_DB_NAME = "Writable MySQL8";
    const workspaceName = "MySQL Workspace";

    beforeEach(() => {
      H.restore("mysql-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      enableWorkspaces(WRITABLE_DB_ID);
      cy.deleteDownloadsFolder();
    });

    it("creates, downloads config, and deletes a workspace as admin", () => {
      cy.log("create the workspace with the schemaless database");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.newButton().click();
      H.NewWorkspaceModal.nameInput().type(workspaceName);
      H.NewWorkspaceModal.databaseCheckbox(MYSQL_DB_NAME).click();
      H.NewWorkspaceModal.createButton().click();

      H.WorkspaceListPage.workspace(workspaceName)
        .should("be.visible")
        .and("contain.text", MYSQL_DB_NAME);

      cy.log("download the workspace config");
      H.WorkspaceListPage.workspaceMenuButton(workspaceName).click();
      H.WorkspaceListPage.downloadConfigMenuItem().click();
      cy.verifyDownload(CONFIG_FILENAME, { timeout: 15000 });
      readConfig().should((contents) => {
        expect(contents).to.contain(workspaceName);
        expect(contents).to.contain(MYSQL_DB_NAME);
        expect(contents).to.contain("mysql");
        expect(contents).not.to.contain("schema-filters-patterns");
      });

      cy.log("delete the workspace");
      H.WorkspaceListPage.workspaceMenuButton(workspaceName).click();
      H.WorkspaceListPage.deleteMenuItem().click();
      H.DeleteWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.workspaceList().should("not.exist");
      H.WorkspaceListPage.newButton().should("be.visible");
    });
  });
});

function enableWorkspaces(databaseId: number) {
  cy.request("GET", `/api/database/${databaseId}`).then(({ body }) => {
    cy.request("PUT", `/api/database/${databaseId}`, {
      settings: { ...body.settings, "database-enable-workspaces": true },
    });
  });
}

function readConfig() {
  const downloadsFolder = Cypress.config("downloadsFolder");
  return cy.readFile(path.join(downloadsFolder, CONFIG_FILENAME));
}
