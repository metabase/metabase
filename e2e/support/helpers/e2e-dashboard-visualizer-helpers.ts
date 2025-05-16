import type { VisualizationDisplay } from "metabase-types/api";

import { getDashboardCard } from "./e2e-dashboard-helpers";
import { modal, sidebar } from "./e2e-ui-elements-helpers";

export function clickVisualizeAnotherWay(name: string) {
  sidebar().within(() => {
    cy.findByRole("menuitem", { name })
      .parent()
      .findByLabelText("Visualize another way")
      .click({ force: true });
  });
  cy.findByTestId("visualization-canvas-loader").should("not.exist");
}

export function dataImporter() {
  return cy.findByTestId("visualizer-data-importer");
}

export function dataSource(dataSourceName: string) {
  return dataImporter()
    .findByText(dataSourceName)
    .parents("[data-testid='data-source-list-item']");
}

/**
 * Unselects a data source.
 * Only works in "ColumnList" mode, despite the name...
 *
 * @param dataSourceName the data source name
 */
export function removeDataSource(dataSourceName: string) {
  dataSource(dataSourceName)
    .findAllByLabelText("Remove")
    .first()
    .click({ force: true });
}

export function dataSourceColumn(dataSourceName: string, columnName: string) {
  return dataSource(dataSourceName)
    .findByText(columnName)
    .parents("[data-testid='column-list-item']");
}

export function assertDataSourceColumnSelected(
  dataSourceName: string,
  columnName: string,
  isSelected = true,
) {
  dataSourceColumn(dataSourceName, columnName).should(
    "have.attr",
    "aria-selected",
    String(isSelected),
  );
}

export function selectDataset(datasetName: string) {
  cy.findByPlaceholderText("Search for something").type(datasetName);
  cy.findAllByText(datasetName).first().click({ force: true });
  cy.wait("@cardQuery");
}

export function addDataset(datasetName: string) {
  cy.findByPlaceholderText("Search for something").clear().type(datasetName);
  cy.findAllByText(datasetName)
    .first()
    .closest("button")
    .siblings('[data-testid="add-dataset-button"]')
    .first()
    .click({ force: true });
  cy.wait("@cardQuery");
}

export function assertCurrentVisualization(name: VisualizationDisplay) {
  cy.findByTestId("viz-picker-main")
    .findByDisplayValue(name)
    .should("be.checked");
}

export function selectVisualization(visualization: VisualizationDisplay) {
  cy.findByTestId("viz-picker-main").within(() => {
    cy.findByTestId(visualization).click();
  });
}

export function switchToAddMoreData() {
  cy.button("Add more data").click();
}

export function switchToColumnsList() {
  cy.button("Done").click();
}

export function ensureDisplayIsSelected(display: VisualizationDisplay) {
  cy.findByDisplayValue(display).should("be.checked");
}

export function selectColumnFromColumnsList(
  datasetName: string,
  columnName: string,
) {
  dataSourceColumn(datasetName, columnName).click();
}

export function deselectColumnFromColumnsList(
  datasetName: string,
  columnName: string,
) {
  dataSourceColumn(datasetName, columnName).findByLabelText("Remove").click();
}

export function verticalWell() {
  return cy.findByTestId("vertical-well");
}

export function assertWellItemsCount(items: {
  horizontal?: number;
  vertical?: number;
  pieMetric?: number;
  pieDimensions?: number;
}) {
  const { horizontal, vertical, pieMetric, pieDimensions } = items;
  if (horizontal) {
    horizontalWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", horizontal);
    });
  }
  if (vertical) {
    verticalWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", vertical);
    });
  }
  if (pieMetric) {
    pieMetricWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", pieMetric);
    });
  }
  if (pieDimensions) {
    pieDimensionWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", pieDimensions);
    });
  }
}

export function assertWellItems(items: {
  horizontal?: string[];
  vertical?: string[];
  pieMetric?: string[];
  pieDimensions?: string[];
}) {
  const { horizontal, vertical, pieMetric, pieDimensions } = items;

  if (horizontal) {
    horizontalWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", horizontal.length);
      horizontal.forEach((item) => {
        cy.findByText(item).should("exist");
      });
    });
  }

  if (vertical) {
    verticalWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", vertical.length);
      vertical.forEach((item) => {
        cy.findByText(item).should("exist");
      });
    });
  }

  if (pieMetric) {
    pieMetricWell().within(() => {
      cy.findAllByTestId("well-item").should("have.length", pieMetric.length);
      pieMetric.forEach((item) => {
        cy.findByText(item).should("exist");
      });
    });
  }

  if (pieDimensions) {
    pieDimensionWell().within(() => {
      cy.findAllByTestId("well-item").should(
        "have.length",
        pieDimensions.length,
      );
      pieDimensions.forEach((item) => {
        cy.findByText(item).should("exist");
      });
    });
  }
}

export function horizontalWell() {
  return cy.findByTestId("horizontal-well");
}

export function pieMetricWell() {
  return cy.findByTestId("pie-metric-well");
}

export function pieDimensionWell() {
  return cy.findByTestId("pie-dimension-well");
}

export function chartLegend() {
  return cy.findByLabelText("Legend");
}

export function chartLegendItems() {
  return chartLegend().findAllByTestId("legend-item");
}

export function chartLegendItem(name: string) {
  return chartLegend().findByText(name);
}

export function showDashcardVisualizerModal(index = 0) {
  return getDashboardCard(index)
    .realHover()
    .within(() => {
      cy.findByLabelText("Edit visualization").click({ force: true });
    });
}

export function showDashcardVisualizerModalSettings(index = 0) {
  showDashcardVisualizerModal(index);

  return modal().within(() => {
    // TODO: replace this with data-testid
    // when https://github.com/metabase/metabase/pull/56483 is merged
    cy.findByText("Settings").click();
  });
}

export function saveDashcardVisualizerModal(
  mode: "create" | "update" = "update",
) {
  modal().within(() => {
    cy.findByText(mode === "create" ? "Add to dashboard" : "Save").click();
  });

  modal({ timeout: 6000 }).should("not.exist");
}

export function saveDashcardVisualizerModalSettings() {
  return saveDashcardVisualizerModal();
}
