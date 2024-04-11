export function ensureDcChartVisibility() {
  cy.get(".dc-chart");
}

export function echartsContainer() {
  return cy.findByTestId("chart-container");
}

export function chartPathWithFillColor(color) {
  return echartsContainer().find(`path[fill="${color}"]`);
}

export function chartPathsWithFillColors(colors) {
  return colors.map(color => chartPathWithFillColor(color));
}

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
export function lineChartCircle() {
  return echartsContainer()
    .find(`path[d="${CIRCLE_PATH}"]`)
    .should("be.visible");
}
