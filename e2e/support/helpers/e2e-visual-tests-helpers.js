export function ensureDcChartVisibility() {
  cy.get(".dc-chart");
}

export function echartsContainer() {
  return cy.findByTestId("chart-container");
}

export function chartPathWithColor(color) {
  return echartsContainer().find(`path[fill="${color}"]`);
}

export function chartPathsWithColors(colors) {
  return colors.map(color => chartPathWithColor(color));
}

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
export function lineChartCircle() {
  return echartsContainer()
    .find(`path[d="${CIRCLE_PATH}"]`)
    .should("be.visible");
}
