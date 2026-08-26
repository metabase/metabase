export const MetricsViewer = {
  goToViewer: () => cy.visit("/explore"),
  formulaInput: () => cy.findByTestId("metrics-formula-input"),
  searchInput: () => {
    // Click the right edge of the container to focus the CodeMirror input
    // without accidentally hitting a pill (which would trigger the swap-metric flow).
    MetricsViewer.formulaInput().click("right");
    return cy.findByTestId("metrics-viewer-search-input");
  },
  searchBarPills: () =>
    cy.get(
      "[data-testid='metrics-viewer-pill'], [data-testid='metrics-viewer-expression-pill']",
    ),
  breakoutLegend: () => cy.findByTestId("metrics-viewer-breakout-legend"),
  getFilterButton: () => cy.findByRole("button", { name: /Filter/ }),
  getAllFilterPills: () => cy.findAllByTestId("metrics-viewer-filter-pill"),
  getDimensionPillBarContainer: () =>
    cy.findByTestId("metrics-viewer-dimension-pill-bar"),
  dimensionPickerSidebar: () =>
    cy.findByTestId("metrics-viewer-dimension-picker-sidebar"),
  getColumnPickerButton: () =>
    MetricsViewer.getMetricControls().findByLabelText("Change column"),
  openDimensionPickerSidebar: () => {
    MetricsViewer.getColumnPickerButton().click();
    return MetricsViewer.dimensionPickerSidebar();
  },
  closeDimensionPickerSidebar: () =>
    MetricsViewer.dimensionPickerSidebar().findByLabelText("Close").click(),
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
  getMetricControls: () => cy.findByTestId("metrics-viewer-controls"),
  changeVizType: (display: string) =>
    MetricsViewer.getMetricControls()
      .findByRole("button", { name: display })
      .click(),
  runButton: () => cy.findByTestId("run-expression-button"),
};
