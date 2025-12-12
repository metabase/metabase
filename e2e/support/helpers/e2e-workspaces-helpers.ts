import type { WorkspaceId } from "metabase-types/api";

export const Workspaces = {
  visit: (id: WorkspaceId) => {
    return cy.visit(`/data-studio/workspace/${id}`);
  },

  visitDataStudio() {
    return cy.visit("/data-studio");
  },

  visitTransformListPage() {
    return cy.visit("/data-studio/transforms");
  },

  getWorkspacesPage() {
    return cy.findByTestId("workspaces-page");
  },

  getWorkspacePage() {
    return cy.findByTestId("workspace-page");
  },

  getWorkspaceContent() {
    return cy.findByTestId("workspace-content");
  },

  getWorkspaceSidebar() {
    return cy.findByTestId("workspace-sidebar");
  },

  getWorkspacesSection() {
    return cy.findByTestId("workspaces-section");
  },

  getWorkspaceItem(name: string | RegExp) {
    return Workspaces.getWorkspacesSection().findByRole("button", { name });
  },

  getWorkspaceItemActions(name: string | RegExp) {
    return Workspaces.getWorkspaceItem(name).findByLabelText("More actions");
  },

  getWorkspaceNameInput() {
    return cy.findByPlaceholderText("Workspace name");
  },

  getMergeWorkspaceButton() {
    return cy.findByRole("button", { name: /Merge/ });
  },

  getRunWorkspaceButton() {
    return Workspaces.getWorkspacePage().findByRole("button", {
      name: /Run transforms/,
    });
  },

  getTransformTargetButton() {
    return cy.findByRole("button", { name: /Change target/ });
  },

  getRunTransformButton() {
    return Workspaces.getWorkspaceContent().findByRole("button", {
      name: /Run/,
    });
  },

  getSaveTransformButton() {
    return cy.findByRole("button", { name: /Save/ });
  },

  getWorkspaceTransforms() {
    return cy.findByTestId("workspace-transforms");
  },

  getMainlandTransforms() {
    return cy.findByTestId("mainland-transforms");
  },

  getNewWorkspaceButton() {
    return cy.findByRole("button", { name: /New workspace/ });
  },

  getNewWorkspaceNameInput() {
    return cy.findByPlaceholderText("Enter workspace name");
  },

  getNewWorkspaceDatabaseInput() {
    return cy.findByPlaceholderText("Select a database");
  },
};
