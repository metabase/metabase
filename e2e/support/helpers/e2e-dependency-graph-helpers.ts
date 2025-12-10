export const DependencyGraph = {
  graph: () => cy.findByTestId("dependency-graph"),
  entryButton: () => cy.findByTestId("graph-entry-button"),
  entrySearchInput: () => cy.findByTestId("graph-entry-search-input"),
  selectionButton: () => cy.findByTestId("graph-selection-button"),
  dependencyPanel: () => cy.findByTestId("graph-dependency-panel"),
};
