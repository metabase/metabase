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

  getWorkspaceNameInput() {
    return cy.findByPlaceholderText("Workspace name");
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
