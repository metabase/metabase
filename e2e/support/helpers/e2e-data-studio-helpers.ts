export const DataStudio = {
  header: () => cy.findByTestId("data-studio-header"),
  exitButton: () => DataStudio.header().findByText("Exit data studio"),
  Transforms: {
    header: () => cy.findByTestId("transforms-header"),
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("transforms-sidebar"),
    saveChangesButton: () => DataStudio.Transforms.queryEditor().button("Save"),
    queryEditor: () => cy.findByTestId("transform-query-editor"),
  },
  Jobs: {
    header: () => cy.findByTestId("jobs-header"),
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("jobs-sidebar"),
  },
  PythonLibrary: {
    header: () => cy.findByTestId("python-library-header"),
  },
};
