export const DependencyGraph = {
  graph: () => cy.findByTestId("dependency-graph"),
  entryButton: () => cy.findByTestId("graph-entry-button"),
  entrySearchInput: () => cy.findByTestId("graph-entry-search-input"),
  selectionButton: () => cy.findByTestId("graph-selection-button"),
  dependencyPanel: () => cy.findByTestId("graph-dependency-panel"),
};

export function waitForDependencyGraph(maxRetries = 1000) {
  if (maxRetries === 0) {
    throw new Error("Timed out waiting for dependency graph");
  }
  cy.request("GET", "/api/ee/dependencies/graph/status").then(({ body }) => {
    if (!body.dependencies_analyzed) {
      waitForDependencyGraph(maxRetries - 1);
    }
  });
}
