import yaml from "js-yaml";

import type { AdvancedConfig } from "metabase-types/api";

import { modal } from "./e2e-ui-elements-helpers";

export const WorkspaceListPage = {
  get: () => cy.findByTestId("workspace-list-page"),
  visit: () => {
    cy.visit("/data-studio/workspaces");
    WorkspaceListPage.get().should("be.visible");
  },
  newButton: ({ primary = true }: { primary?: boolean } = {}) =>
    WorkspaceListPage.get().findByRole("button", {
      name: primary ? "Create a workspace" : "New",
    }),
  setupInstanceButton: () =>
    WorkspaceListPage.get().findByRole("button", {
      name: "Upload a workspace config",
    }),
  workspaceList: () => WorkspaceListPage.get().findByTestId("workspace-list"),
  workspace: (name: string) =>
    WorkspaceListPage.get().findByRole("region", { name }),
  workspaceMenuButton: (name: string) =>
    WorkspaceListPage.workspace(name).findByRole("button", {
      name: "Workspace options",
    }),
  renameMenuItem: () => cy.findByRole("menuitem", { name: "Rename" }),
  downloadConfigMenuItem: () =>
    cy.findByRole("menuitem", { name: /Download config\.yml/ }),
  deleteMenuItem: () => cy.findByRole("menuitem", { name: "Delete" }),
};

export const NewWorkspaceModal = {
  get: () => modal(),
  nameInput: () => NewWorkspaceModal.get().findByLabelText("Name"),
  databaseCheckbox: (name: string) =>
    NewWorkspaceModal.get().findByRole("checkbox", { name }),
  createButton: () =>
    NewWorkspaceModal.get().findByRole("button", { name: "Create workspace" }),
  cancelButton: () =>
    NewWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
};

export const RenameWorkspaceModal = {
  get: () => modal(),
  nameInput: () => RenameWorkspaceModal.get().findByLabelText("Name"),
  renameButton: () =>
    RenameWorkspaceModal.get().findByRole("button", { name: "Rename" }),
  cancelButton: () =>
    RenameWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
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

export const CurrentWorkspacePage = {
  get: () => cy.findByTestId("current-workspace-page"),
  visit: () => {
    cy.visit("/data-studio/workspaces");
    CurrentWorkspacePage.get().should("be.visible");
  },
  database: (name: string) =>
    CurrentWorkspacePage.get().findByRole("region", { name }),
  remappingRow: (canonicalName: string) =>
    CurrentWorkspacePage.get().findByText(canonicalName),
  leaveButton: () =>
    CurrentWorkspacePage.get().findByRole("button", {
      name: "Leave workspace",
    }),
};

export const LeaveWorkspaceModal = {
  get: () => modal(),
  confirmButton: () =>
    LeaveWorkspaceModal.get().findByRole("button", { name: "Leave workspace" }),
  cancelButton: () =>
    LeaveWorkspaceModal.get().findByRole("button", { name: "Cancel" }),
};
