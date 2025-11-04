export const DataStudio = {
  header: () => cy.findByTestId("data-studio-header"),
  exitButton: () => DataStudio.header().findByText("Exit data studio"),
  Transforms: {
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("transforms-sidebar"),
    saveChangesButton: () => DataStudio.Transforms.queryEditor().button("Save"),
    queryEditor: () => cy.findByTestId("transform-query-editor"),
  },
  Jobs: {
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("jobs-sidebar"),
  },
};
