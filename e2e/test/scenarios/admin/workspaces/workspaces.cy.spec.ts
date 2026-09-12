import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > admin > workspaces", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("PUT", "/api/setting/workspaces-enabled").as(
      "updateWorkspacesEnabledSetting",
    );
    cy.intercept("PUT", `/api/database/${WRITABLE_DB_ID}`).as("updateDatabase");
  });

  it("should let an admin turn on workspaces and set a database's workspace schema", () => {
    cy.log("enable workspaces in admin settings");
    cy.visit("/admin/settings/general");
    workspacesSetting().within(() => {
      cy.findByText("Enable workspaces").should("exist");
      cy.findByLabelText("Disabled").click({ force: true });
    });
    cy.wait("@updateWorkspacesEnabledSetting");
    workspacesSetting().findByLabelText("Enabled").should("exist");

    cy.log("set the workspace schema for the database");
    visitDatabaseAdminPage();
    workspacesSection().within(() => {
      cy.findByText("Workspace schema").should("exist");
      cy.findByPlaceholderText("Select a schema").click();
    });
    H.popover().findByText("public").click();
    cy.wait("@updateDatabase").then(({ request }) => {
      expect(request.body.settings).to.deep.equal({
        "workspaces-schema": "public",
      });
    });

    cy.log("the selection should persist after a reload");
    cy.reload();
    workspacesSection()
      .findByTestId("workspace-schema-select")
      .should("have.value", "public");
  });
});

function visitDatabaseAdminPage() {
  cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
}

function workspacesSetting() {
  return cy.findByTestId("workspaces-enabled-setting");
}

function workspacesSection() {
  return cy.findByTestId("workspaces-section");
}
