import yaml from "js-yaml";

import type { AdvancedConfig, WorkspaceId } from "metabase-types/api";

import { modal } from "./e2e-ui-elements-helpers";

export const WorkspaceListPage = {
  get: () => cy.findByTestId("workspace-list-page"),
  visit: () => {
    cy.visit("/data-studio/workspaces");
    WorkspaceListPage.get().should("be.visible");
  },
  newButton: ({ first = true }: { first?: boolean } = {}) =>
    WorkspaceListPage.get().findByRole("button", {
      name: first ? "Create a workspace" : "New",
    }),
  setupInstanceButton: () =>
    WorkspaceListPage.get().findByRole("button", {
      name: "upload a workspace config",
    }),
  workspaceList: () => WorkspaceListPage.get().findByTestId("workspace-list"),
  workspace: (name: string) =>
    WorkspaceListPage.get().findByRole("region", { name }),
};

export const NewWorkspaceModal = {
  get: () => modal(),
  nameInput: () => NewWorkspaceModal.get().findByLabelText("Name"),
  createButton: () =>
    NewWorkspaceModal.get().findByRole("button", { name: "Create" }),
  cancelButton: () =>
    NewWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
};

export const SetupWorkspaceModal = {
  get: () => modal(),
  configInput: () => SetupWorkspaceModal.get().get('input[type="file"]'),
  setupButton: () =>
    SetupWorkspaceModal.get().findByRole("button", { name: "Set up" }),
  cancelButton: () =>
    SetupWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
  uploadConfig: (config: AdvancedConfig) => {
    SetupWorkspaceModal.configInput().selectFile(
      {
        contents: Cypress.Buffer.from(yaml.dump(config)),
        fileName: "config.yml",
        mimeType: "application/yaml",
      },
      { force: true },
    );
  },
};

export const WorkspacePage = {
  get: () => cy.findByTestId("workspace-page"),
  visit: (id: WorkspaceId) => {
    cy.visit(`/data-studio/workspaces/${id}`);
    WorkspacePage.get().should("be.visible");
  },
  nameInput: () => WorkspacePage.get().findByTestId("workspace-name-input"),
  breadcrumbs: () =>
    WorkspacePage.get().findByTestId("data-studio-breadcrumbs"),
  menuButton: () =>
    WorkspacePage.get().findByRole("button", { name: "Workspace actions" }),
  deleteMenuItem: () => cy.findByRole("menuitem", { name: "Delete" }),
};

export const DeleteWorkspaceModal = {
  get: () => modal(),
  confirmButton: () =>
    DeleteWorkspaceModal.get().findByRole("button", {
      name: "Delete workspace",
    }),
  cancelButton: () =>
    DeleteWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
};

export const WorkspaceDatabaseSection = {
  get: () => cy.findByTestId("workspace-database-section"),
  addDatabaseButton: ({ first = true }: { first?: boolean } = {}) =>
    WorkspaceDatabaseSection.get().findByRole("button", {
      name: first ? "Add database" : "Add another database",
    }),
  databaseList: () =>
    WorkspaceDatabaseSection.get().findAllByTestId("workspace-database-item"),
  database: (name: string) =>
    WorkspaceDatabaseSection.get().findByRole("region", { name }),
  databaseMenuButton: (name: string) =>
    WorkspaceDatabaseSection.database(name).findByRole("button", {
      name: "Database actions",
    }),
  editMenuItem: () => cy.findByRole("menuitem", { name: "Edit" }),
  removeMenuItem: () => cy.findByRole("menuitem", { name: "Remove" }),
};

export const NewWorkspaceDatabaseModal = {
  get: () => modal(),
  databaseSelect: () =>
    NewWorkspaceDatabaseModal.get().findByRole("textbox", { name: "Database" }),
  schemasGroup: () =>
    NewWorkspaceDatabaseModal.get().findByText("Schemas to include"),
  schemaSelect: () =>
    NewWorkspaceDatabaseModal.get().findByLabelText("Schemas to include"),
  schemaOption: (name: string) => cy.findByRole("option", { name }),
  selectAllSchemasButton: () =>
    NewWorkspaceDatabaseModal.get().findByRole("button", {
      name: "Select all",
    }),
  submitButton: () =>
    NewWorkspaceDatabaseModal.get().findByRole("button", {
      name: "Add database",
    }),
  cancelButton: () =>
    NewWorkspaceDatabaseModal.get().findByRole("button", { name: "Cancel" }),
};

export const UpdateWorkspaceDatabaseModal = {
  get: () => modal(),
  schemasGroup: () =>
    UpdateWorkspaceDatabaseModal.get().findByText("Schemas to include"),
  schemaSelect: () =>
    UpdateWorkspaceDatabaseModal.get().findByLabelText("Schemas to include"),
  schemaOption: (name: string) => cy.findByRole("option", { name }),
  selectAllSchemasButton: () =>
    UpdateWorkspaceDatabaseModal.get().findByRole("button", {
      name: "Select all",
    }),
  saveButton: () =>
    UpdateWorkspaceDatabaseModal.get().findByRole("button", {
      name: "Save changes",
    }),
  cancelButton: () =>
    UpdateWorkspaceDatabaseModal.get().findByRole("button", { name: "Cancel" }),
};

export const RemoveWorkspaceDatabaseModal = {
  get: () => modal(),
  confirmButton: () =>
    RemoveWorkspaceDatabaseModal.get().findByRole("button", { name: "Remove" }),
  cancelButton: () =>
    RemoveWorkspaceDatabaseModal.get().findByRole("button", { name: "Cancel" }),
};

export const WorkspaceSetupSection = {
  get: () => cy.findByTestId("workspace-setup-section"),
  downloadConfigButton: () =>
    WorkspaceSetupSection.get().findByRole("link", {
      name: /Download config\.yml/,
    }),
};

export const WorkspaceInstancePage = {
  get: () => cy.findByTestId("workspace-instance-page"),
  visit: () => {
    cy.visit("/data-studio/workspaces");
    WorkspaceInstancePage.get().should("be.visible");
  },
  database: (name: string) =>
    WorkspaceInstancePage.get().findByRole("region", { name }),
  remappingRow: (canonicalName: string) =>
    WorkspaceInstancePage.get().findByText(canonicalName),
  leaveButton: () =>
    WorkspaceInstancePage.get().findByRole("button", {
      name: "Leave workspace",
    }),
};

export const ExitWorkspaceModal = {
  get: () => modal(),
  confirmButton: () =>
    ExitWorkspaceModal.get().findByRole("button", {
      name: "Leave workspace",
    }),
  cancelButton: () =>
    ExitWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
};
