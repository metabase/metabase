import type {
  DependencyGraph as DependencyGraphData,
  DependencyId,
  DependencyNode,
  DependencyType,
  ListBreakingGraphNodesResponse,
  ListUnreferencedGraphNodesResponse,
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
  visitUnreferencedEntities: () => {
    cy.intercept("GET", "/api/ee/dependencies/graph/unreferenced*").as(
      "unreferencedEntities",
    );
    cy.visit("/data-studio/dependency-diagnostics/unreferenced");
    cy.wait("@unreferencedEntities");
    DependencyDiagnostics.list().should("be.visible");
  },
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

const WAIT_TIMEOUT = 30000;
const WAIT_INTERVAL = 100;

export function waitForBackfillComplete(
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<{
      complete: boolean;
    }>("GET", "/api/ee/dependencies/backfill-status")
    .then((response) => {
      if (response.body.complete) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForBackfillComplete(timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Dependency backfill timeout");
      }
    });
}

export function waitForGraphDependencies(
  id: DependencyId,
  type: DependencyType,
  filter: (graph: DependencyGraphData) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<DependencyGraphData>(
      "GET",
      `/api/ee/dependencies/graph?id=${id}&type=${type}`,
    )
    .then((response) => {
      if (filter(response.body)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForGraphDependencies(
          id,
          type,
          filter,
          timeout - WAIT_INTERVAL,
        );
      } else {
        throw new Error("Dependency graph retry timeout");
      }
    });
}

export function waitForUnreferencedEntities(
  filter: (nodes: DependencyNode[]) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable {
  return cy
    .request<ListUnreferencedGraphNodesResponse>(
      "GET",
      "/api/ee/dependencies/graph/unreferenced?include-personal-collections=true",
    )
    .then((response) => {
      if (filter(response.body.data)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(WAIT_INTERVAL);
        return waitForUnreferencedEntities(filter, timeout - WAIT_INTERVAL);
      } else {
        throw new Error("Unreferenced entities analysis retry timeout");
      }
    });
}

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
