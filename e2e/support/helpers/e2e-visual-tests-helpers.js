import { popover } from "e2e/support/helpers/e2e-ui-elements-helpers";
import { color as getColor } from "metabase/lib/colors";
import { Icons } from "metabase/ui";
import { GOAL_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/goal-line.ts";
import { TREND_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/trend-line.ts";
import {
  setSvgColor,
  svgToDataUri,
} from "metabase/visualizations/echarts/cartesian/timeline-events/option";

export function echartsContainer() {
  return cy.findByTestId("chart-container");
}

export function echartsTriggerBlur() {
  return echartsContainer().realHover({ position: "right" });
}

export function ensureEchartsContainerHasSvg() {
  return echartsContainer().should(root => {
    // Check if there's an SVG child within the element
    expect(root.find("svg").length, "SVG exists").to.be.equal(1);
  });
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

export function echartsIcon(name, isSelected = false) {
  const iconSvg = setSvgColor(
    Icons[name].source,
    getColor(isSelected ? "brand" : "text-light"),
  );
  const dataUri = svgToDataUri(iconSvg);

  return echartsContainer().find(`image[href="${dataUri}"]`);
}

export function chartPathWithFillColor(color) {
  return echartsContainer().find(`path[fill="${color}"]`);
}

export function sankeyEdge(color) {
  return echartsContainer().find(`path[fill="${color}"][fill-opacity="0.2"]`);
}

export function chartPathsWithFillColors(colors) {
  return colors.map(color => chartPathWithFillColor(color));
}

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
export function cartesianChartCircle() {
  return echartsContainer()
    .find(`path[d="${CIRCLE_PATH}"]`)
    .should("be.visible");
}

export function cartesianChartCircleWithColor(color) {
  return echartsContainer()
    .find(`path[d="${CIRCLE_PATH}"][stroke="${color}"]`)
    .should("be.visible");
}

export function cartesianChartCircleWithColors(colors) {
  return colors.map(color => cartesianChartCircleWithColor(color));
}

export function otherSeriesChartPaths() {
  return chartPathWithFillColor("#949AAB");
}

export function scatterBubbleWithColor(color) {
  return echartsContainer().find(`path[d="${CIRCLE_PATH}"][fill="${color}"]`);
}

export function getValueLabels() {
  return echartsContainer().find("text[stroke-width='3']");
}

export function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}

export function testTooltipPairs(rowPairs = []) {
  popover().within(() => {
    rowPairs.forEach(([label, value]) => {
      testPairedTooltipValues(label, value);
    });
  });
}

export function testStackedTooltipRows(rows = []) {
  popover().within(() => {
    rows.forEach(([label, value, percent]) => {
      cy.findByText(label)
        .parent()
        .within(() => {
          cy.findByTestId("row-value").should("have.text", value);
          cy.findByTestId("row-percent").should("have.text", percent);
        });
    });
  });
}

export function pieSlices() {
  return echartsContainer().find("path[stroke-linejoin='bevel']");
}

export function pieSliceWithColor(color) {
  return echartsContainer().find(
    `path[stroke-linejoin='bevel'][fill='${color}']`,
  );
}

export function echartsTooltip() {
  // ECharts may keep two dom instances of the tooltip
  return cy
    .findAllByTestId("echarts-tooltip")
    .filter(":visible")
    .should("have.length", 1)
    .eq(0);
}

export function tooltipHeader() {
  return cy.findByTestId("echarts-tooltip-header");
}

function tooltipFooter() {
  return cy.findByTestId("echarts-tooltip-footer");
}

export function assertTooltipRow(
  name,
  { color, value, secondaryValue, index } = {},
) {
  cy.findAllByText(name)
    .eq(index ?? 0)
    .parent("tr")
    .within(() => {
      if (color) {
        cy.get("td")
          .eq(0)
          .find("span")
          .should("have.class", `marker-${color.replace("#", "")}`);
      }

      if (value) {
        cy.findByText(value);
      }

      if (secondaryValue) {
        cy.findByText(secondaryValue);
      }
    });
}

function assertTooltipFooter({ name, value, secondaryValue }) {
  tooltipFooter().within(() => {
    if (name) {
      cy.findByText(name);
    }
    if (value) {
      cy.findByText(value);
    }
    if (secondaryValue) {
      cy.findByText(secondaryValue);
    }
  });
}

export function assertEChartsTooltip({ header, rows, footer, blurAfter }) {
  echartsTooltip().should("be.visible");
  echartsTooltip().within(() => {
    if (header != null) {
      tooltipHeader().should("have.text", header);
    }

    if (rows != null) {
      rows.forEach(row => {
        const { name, ...rest } = row;
        assertTooltipRow(name, rest);
      });
    }

    if (footer != null) {
      assertTooltipFooter(footer);
    }
  });

  if (blurAfter) {
    echartsTriggerBlur();
  }
}

export function assertEChartsTooltipNotContain(rows) {
  echartsTooltip().within(() => {
    rows.forEach(row => {
      cy.findByText(row).should("not.exist");
    });
  });
}
