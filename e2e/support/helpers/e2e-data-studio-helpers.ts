export const DataStudio = {
  header: () => cy.findByTestId("data-studio-header"),
  exitButton: () => DataStudio.header().findByText("Exit data studio"),
};
