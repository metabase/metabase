import { color as getColor } from "metabase/lib/colors";
import { Icons } from "metabase/ui";
import { GOAL_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/goal-line.ts";
import { TREND_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/trend-line.ts";
import {
  setSvgColor,
  svgToDataUri,
} from "metabase/visualizations/echarts/cartesian/timeline-events/option";

export function ensureDcChartVisibility() {
  cy.get(".dc-chart");
}

export function echartsContainer() {
  return cy.findByTestId("chart-container");
}

export function goalLine() {
  return echartsContainer().find(
    `path[stroke-dasharray='${GOAL_LINE_DASH.join(",")}']`,
  );
}

export function trendLine() {
  return echartsContainer().find(
    `path[stroke-dasharray='${TREND_LINE_DASH.join(",")}']`,
  );
}

export function getXYTransform(element) {
  const transform = element.prop("transform");
  const {
    baseVal: [{ matrix }],
  } = transform;

  const { e: x, f: y } = matrix;

  return { x, y };
}

export function echartsIcon(name, color = undefined) {
  const iconSvg = setSvgColor(
    Icons[name].source,
    color ?? getColor("text-light"),
  );
  const dataUri = svgToDataUri(iconSvg);

  return echartsContainer().find(`image[href="${dataUri}"]`);
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

export function lineChartCircleWithColor(color) {
  return echartsContainer()
    .find(`path[d="${CIRCLE_PATH}"][stroke="${color}"]`)
    .should("be.visible");
}

export function lineChartCircleWithColors(colors) {
  return colors.map(color => lineChartCircleWithColor(color));
}
