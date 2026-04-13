export const MetricsViewer = {
  goToViewer: () => cy.visit("/explore"),
  searchInput: () => {
    // Click the right edge of the container to focus the CodeMirror input
    // without accidentally hitting a pill (which would trigger the swap-metric flow).
    cy.findByTestId("metrics-formula-input").click("right");
    return cy.findByTestId("metrics-viewer-search-input");
  },
  searchBarPills: () => cy.findAllByTestId("metrics-viewer-search-pill"),
  searchResults: () => cy.findByTestId("metrics-search-results"),
  breakoutLegend: () => cy.findByTestId("metrics-viewer-breakout-legend"),
  getFilterButton: () => cy.findByRole("button", { name: /Filter/ }),
  getAllFilterPills: () => cy.findAllByTestId("metrics-viewer-filter-pill"),
  getDimensionPillContainer: () =>
    cy.findByTestId("metrics-viewer-dimension-pill-container"),
  tablist: () => cy.findByRole("tablist"),
  getTab: (tab: string) =>
    MetricsViewer.tablist().findByRole("tab", { name: tab }),
  tabsShouldBe: (tabs: string[]) => {
    tabs.forEach((tab) =>
      MetricsViewer.tablist().findByRole("tab", { name: tab }).should("exist"),
    );
  },
  getMetricVisualization: () => cy.findByTestId("visualization-root"),
  getMetricVisualizationDataPoints: () =>
    MetricsViewer.getMetricVisualization().get(
      "path[fill='hsla(0, 0%, 100%, 1.00)']",
    ),
  getAllMetricVisualizations: () => cy.findAllByTestId("visualization-root"),

  assertVizType: (displayType: string) =>
    MetricsViewer.getMetricVisualization().should(
      "have.attr",
      "data-viz-ui-name",
      displayType,
    ),
  assertAllVizTypes: (displayType: string, expectedLength?: number) => {
    const subject = MetricsViewer.getAllMetricVisualizations();
    if (expectedLength !== undefined) {
      subject.should("have.length", expectedLength);
    }
    subject.each(($el) => {
      cy.wrap($el).should("have.attr", "data-viz-ui-name", displayType);
    });
  },
  getMerticControls: () => cy.findByTestId("metrics-viewer-controls"),
  changeVizType: (display: string) =>
    MetricsViewer.getMerticControls()
      .findByRole("button", { name: display })
      .click(),
  getLayoutControls: () => cy.findByTestId("metrics-viewer-layout-controls"),
  getAllCards: () => cy.findAllByTestId("metrics-viewer-card"),
  getAddDimensionButton: () =>
    cy.findByRole("button", { name: "Add dimension tab" }),
  getRemoveTabButton: (tabLabel: string) =>
    cy.findByRole("button", { name: `Remove ${tabLabel} tab` }),
  openMetricHomePage: (metricName: string) => {
    MetricsViewer.searchBarPills().contains(metricName).rightclick();
    cy.findByText(/Go to metric home page/).click();
  },
  runButton: () => cy.findByTestId("run-expression-button"),
};
