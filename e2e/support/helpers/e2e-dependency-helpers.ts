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
