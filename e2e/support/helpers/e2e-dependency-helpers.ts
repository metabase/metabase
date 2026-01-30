import type {
  DependencyNode,
  ListBreakingGraphNodesResponse,
} from "metabase-types/api";

export const DependencyGraph = {
  graph: () => cy.findByTestId("dependency-graph"),
  entryButton: () => cy.findByTestId("graph-entry-button"),
  entrySearchInput: () => cy.findByTestId("graph-entry-search-input"),
  selectionButton: () => cy.findByTestId("graph-selection-button"),
  dependencyPanel: () => cy.findByTestId("graph-dependency-panel"),
};

export const DependencyDiagnostics = {
  visitBrokenDependencies: () =>
    cy.visit("/data-studio/dependency-diagnostics/broken"),
  visitUnreferencedEntities: () =>
    cy.visit("/data-studio/dependency-diagnostics/unreferenced"),
  list: () => cy.findByTestId("dependency-list"),
  searchInput: () => cy.findByTestId("dependency-list-search-input"),
  filterButton: () => cy.findByTestId("dependency-filter-button"),
  sidebar: () => cy.findByTestId("dependency-list-sidebar"),

  Sidebar: {
    get: () => cy.findByTestId("dependency-list-sidebar"),
    header: () => cy.findByTestId("dependency-list-sidebar-header"),
    locationSection: () => cy.findByRole("region", { name: "Location" }),
    infoSection: () => cy.findByRole("region", { name: "Info" }),
    errorsSection: (name: string) => cy.findByRole("region", { name }),
    missingColumnsSection: () =>
      cy.findByRole("region", { name: "Missing columns" }),
    fieldsSection: () => cy.findByRole("region", { name: "Fields" }),
    brokenDependentsSection: () =>
      cy.findByRole("region", { name: "Broken dependents" }),
  },
};

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

export function waitForBreakingDependencies(
  filter: (nodes: DependencyNode[]) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<ListBreakingGraphNodesResponse>(
      "GET",
      "/api/ee/dependencies/graph/breaking",
    )
    .then((response) => {
      if (filter(response.body.data)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForBreakingDependencies(filter, timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Dependency analysis retry timeout");
      }
    });
}
