import type { WorkspaceId } from "metabase-types/api";

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
  databaseRadio: (name: string) =>
    NewWorkspaceDatabaseModal.get().findByRole("radio", { name }),
  schemasInput: () =>
    NewWorkspaceDatabaseModal.get().findByLabelText("Schemas to include"),
  submitButton: () =>
    NewWorkspaceDatabaseModal.get().findByRole("button", {
      name: "Add database",
    }),
  cancelButton: () =>
    NewWorkspaceDatabaseModal.get().findByRole("button", { name: "Cancel" }),
};

export const UpdateWorkspaceDatabaseModal = {
  get: () => modal(),
  schemasInput: () =>
    UpdateWorkspaceDatabaseModal.get().findByLabelText("Schemas to include"),
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
    cy.visit("/data-studio/workspaces/instance");
    WorkspaceInstancePage.get().should("be.visible");
  },
};
