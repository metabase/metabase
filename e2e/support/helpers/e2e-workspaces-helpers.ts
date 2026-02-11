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

  openSetupTab() {
    this.getWorkspaceContent().findByRole("tab", { name: "Setup" }).click();
  },

  openCodeTab() {
    this.getWorkspaceSidebar().findByRole("tab", { name: "Code" }).click();
  },

  openDataTab() {
    this.getWorkspaceSidebar().findByRole("tab", { name: "Data" }).click();
  },

  openGraphTab() {
    this.getWorkspaceContent().findByRole("tab", { name: "Graph" }).click();
  },

  getWorkspacesSection() {
    return cy.findByTestId("workspaces-section");
  },

  getWorkspaceItem(name: string) {
    return this.getWorkspacesSection().find(`a[name="${name}"]`);
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

  getRunAllTransformsButton() {
    return cy.findByTestId("run-all-button");
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
    return this.getTransformTabHeader().findByTestId("run-button", {
      timeout: 10_000,
    });
  },

  getRunStatus() {
    return cy.findByTestId("run-status");
  },

  getSaveTransformButton() {
    return this.getTransformTabHeader().findByRole("button", { name: /Save/ });
  },

  getWorkspaceTransforms() {
    return cy.findByTestId("workspace-transforms");
  },

  getMainlandTransforms() {
    return cy.findByTestId("mainland-transforms", { timeout: 10_000 });
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
    return cy.findByText(name).parent().findByTestId("status-dot");
  },

  getTransformTargetDiff() {
    return cy.findByTestId("transform-target-diff");
  },

  getSourceTablesDiff() {
    return cy.findByTestId("source-tables-diff");
  },
};
