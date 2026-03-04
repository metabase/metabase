const { H } = cy;

import type { StructuredQuestionDetails } from "e2e/support/helpers";

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

export const MetricsViewer = {
  goToViewer: () => cy.visit("/explore"),
  searchInput: () => cy.findByTestId("metrics-viewer-search-input"),
  searchBarPills: () => cy.findAllByTestId("metrics-viewer-search-pill"),
  searchResults: () => cy.findByTestId("metrics-search-results"),
  breakoutLegend: () => cy.findByTestId("metrics-viewer-breakout-legend"),
  getFilterButton: () => cy.findByRole("button", { name: /Filter/ }),
  getAllFilterPills: () => cy.findAllByTestId("metrics-viewer-filter-pill"),
  tablist: () => cy.findByRole("tablist"),
  getTab: (tab: string) =>
    MetricsViewer.tablist().findByRole("tab", { name: tab }),
  tabsShouldBe: (tabs: string[]) => {
    tabs.forEach((tab) =>
      MetricsViewer.tablist().findByRole("tab", { name: tab }).should("exist"),
    );
  },
  getMetricVisualization: () => cy.findByTestId("visualization-root"),
  getAllMetricVisualizations: () => cy.findAllByTestId("visualization-root"),

  assertVizType: (displayType: string) =>
    MetricsViewer.getMetricVisualization().should(
      "have.attr",
      "data-viz-ui-name",
      displayType,
    ),
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
};

export function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) => H.createQuestion(metric));
}
