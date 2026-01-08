import type { WorkspaceId } from "metabase-types/api";

export const Workspaces = {
  visit: (id: WorkspaceId) => {
    return cy.visit(`/data-studio/workspace/${id}`);
  },

  visitDataStudio() {
    return cy.visit("/data-studio");
  },

  visitWorkspaces() {
    return cy.visit("/data-studio/workspaces");
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

  getWorkspaceTabs() {
    return cy.findByTestId("workspace-tabs");
  },

  getWorkspaceSidebar() {
    return cy.findByTestId("workspace-sidebar");
  },

  openCodeTab() {
    return this.getWorkspaceSidebar().within(() => {
      return cy.findByRole("tab", { name: "Code" }).click();
    });
  },

  openDataTab() {
    return this.getWorkspaceSidebar().within(() => {
      return cy.findByRole("tab", { name: "Data" }).click();
    });
  },

  getWorkspacesSection() {
    return cy.findByTestId("workspaces-section");
  },

  getWorkspaceItem(name: string) {
    return this.getWorkspacesSection().find(`button[name="${name}"]`);
  },

  getWorkspaceItemStatus(name: string) {
    return this.getWorkspaceItem(name).findByTestId("workspace-status");
  },

  getWorkspaceItemActions(name: string) {
    return this.getWorkspaceItem(name).findByLabelText("More actions");
  },

  getWorkspaceNameInput() {
    return cy.findByPlaceholderText("Workspace name");
  },

  getMergeWorkspaceButton() {
    return cy.findByRole("button", { name: /Merge/ });
  },

  getMergeCommitInput() {
    return cy.findByPlaceholderText(
      "Describe the changes you made in this workspace...",
    );
  },

  getWorkspaceDatabaseSelect() {
    return cy.findByPlaceholderText("Select a database");
  },

  getTransformTabHeader() {
    return cy.findByTestId("transform-tab-header");
  },

  getTransformTargetButton() {
    return this.getTransformTabHeader().findByRole("button", {
      name: /Change target/,
    });
  },

  getRunTransformButton() {
    return this.getTransformTabHeader().findByTestId("run-button");
  },

  getSaveTransformButton() {
    return this.getTransformTabHeader().findByRole("button", { name: /Save/ });
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

  getTransformStatusDot(name: string | RegExp) {
    return cy.findByText(name).parent().find('[class*="statusDot"]');
  },
};
