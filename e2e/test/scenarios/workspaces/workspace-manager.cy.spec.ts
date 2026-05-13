import path from "path";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const POSTGRES_DB_NAME = "Writable Postgres12";
const MYSQL_DB_NAME = "Writable MySQL8";

const PG_SCHEMA_A = "Domestic";
const PG_SCHEMA_B = "Wild";

const CONFIG_FILENAME = "config.yml";

describe("scenarios > workspaces > workspace manager", () => {
  describe("navigation", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    it("renames a workspace and navigates between the workspace and the list", () => {
      const originalName = "My workspace";
      const renamedName = "Renamed workspace";

      cy.log("create the workspace from the empty state");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.newButton().click();
      H.NewWorkspaceModal.nameInput().type(originalName);
      H.NewWorkspaceModal.createButton().click();
      H.WorkspacePage.get().should("be.visible");

      cy.log("rename the workspace in the header");
      H.WorkspacePage.nameInput()
        .should("have.value", originalName)
        .clear()
        .type(renamedName)
        .blur();
      H.WorkspacePage.nameInput().should("have.value", renamedName);

      cy.log("navigate back to the list via the breadcrumbs");
      H.WorkspacePage.breadcrumbs()
        .findByRole("link", { name: "Workspaces" })
        .click();
      H.WorkspaceListPage.get().should("be.visible");

      cy.log("open the renamed workspace from the list");
      H.WorkspaceListPage.workspace(renamedName).should("be.visible").click();
      H.WorkspacePage.get().should("be.visible");
      H.WorkspacePage.nameInput().should("have.value", renamedName);
    });
  });

  describe("postgres (with schemas)", () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      cy.deleteDownloadsFolder();
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
      downloadConfig();
      readConfig().should((contents) => {
        expect(contents).to.contain(workspaceName);
        expect(contents).to.contain(POSTGRES_DB_NAME);
        expect(contents).to.contain("postgres");
        expect(contents).to.contain(PG_SCHEMA_A);
        expect(contents).to.contain(PG_SCHEMA_B);
        expect(contents).to.match(/schema-filters-patterns:.*Domestic.*Wild/);
      });

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
      cy.deleteDownloadsFolder();
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
      H.NewWorkspaceDatabaseModal.schemasInput().should("not.exist");
      H.NewWorkspaceDatabaseModal.submitButton().click();

      H.WorkspaceDatabaseSection.database(MYSQL_DB_NAME).should("be.visible");

      cy.log("download the workspace config");
      downloadConfig();
      readConfig().should((contents) => {
        expect(contents).to.contain(workspaceName);
        expect(contents).to.contain(MYSQL_DB_NAME);
        expect(contents).to.contain("mysql");
        expect(contents).not.to.contain("schema-filters-patterns");
      });

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

function downloadConfig() {
  H.WorkspaceSetupSection.downloadConfigButton().click();
  cy.verifyDownload(CONFIG_FILENAME, { timeout: 15000 });
}

function readConfig() {
  const downloadsFolder = Cypress.config("downloadsFolder");
  return cy.readFile(path.join(downloadsFolder, CONFIG_FILENAME));
}
