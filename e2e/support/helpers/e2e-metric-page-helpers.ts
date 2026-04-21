const metricAboutPage = () => cy.findByTestId("metric-about-page");
const metricOverviewPage = () => cy.findByTestId("metric-overview-page");
const metricQueryEditor = () => cy.findByTestId("metric-query-editor");

export const MetricPage = {
  aboutPage: metricAboutPage,
  overviewPage: metricOverviewPage,
  queryEditor: metricQueryEditor,
  nameInput: () => metricQueryEditor().findByPlaceholderText("New metric"),
  saveButton: () => metricQueryEditor().findByRole("button", { name: "Save" }),
  cancelButton: () =>
    metricQueryEditor().findByRole("button", { name: "Cancel" }),
  header: () => cy.findByTestId("metric-header"),
  moreMenu: () => cy.findByLabelText("More options"),
  aboutTab: () => MetricPage.header().findByText("About"),
  overviewTab: () => MetricPage.header().findByText("Overview"),
  definitionTab: () => MetricPage.header().findByText("Definition"),
  dependenciesTab: () => MetricPage.header().findByText("Dependencies"),
  cachingTab: () => MetricPage.header().findByText("Caching"),
  historyTab: () => MetricPage.header().findByText("History"),
  aboutPageDescriptionSidebar: () =>
    metricAboutPage().findByTestId("metric-description-sidebar"),
  exploreLink: () => cy.findByTestId("explore-link"),
};
