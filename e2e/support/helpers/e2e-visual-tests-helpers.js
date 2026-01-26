import { popover } from "e2e/support/helpers/e2e-ui-elements-helpers";
import { color as getColor } from "metabase/lib/colors";
import { Icons } from "metabase/ui/components/icons/Icon/icons";
import { GOAL_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/goal-line.ts";
import { TREND_LINE_DASH } from "metabase/visualizations/echarts/cartesian/option/trend-line.ts";
import {
  setSvgColor,
  svgToDataUri,
} from "metabase/visualizations/echarts/cartesian/timeline-events/option";

import { isFixedPositionElementVisible } from "./e2e-element-visibility-helpers";

export function ensureChartIsActive() {
  cy.findByTestId("debounced-frame-root").should(
    "not.have.css",
    "pointer-events",
    "none",
  );
}

export function echartsContainer() {
  return cy.findByTestId("chart-container");
}

export function echartsTriggerBlur() {
  echartsContainer().realHover({ position: "right" });
  cy.wait(700); // Waiting until tooltip disappears
}

export function ensureEchartsContainerHasSvg() {
  return echartsContainer().should((root) => {
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
    getColor(isSelected ? "brand" : "text-tertiary"),
  );
  const dataUri = svgToDataUri(iconSvg);

  return echartsContainer().find(`image[href="${dataUri}"]`);
}

export function chartGridLines() {
  return echartsContainer().find(
    "path[stroke='var(--mb-color-cartesian-grid-line)'][fill='none']",
  );
}

export function chartPathWithFillColor(color) {
  return echartsContainer().find(`path[fill="${color}"]`);
}

export function sankeyEdge(color) {
  return echartsContainer().find(`path[fill="${color}"][fill-opacity="0.2"]`);
}

export function chartPathsWithFillColors(colors) {
  return colors.map((color) => chartPathWithFillColor(color));
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
  return colors.map((color) => cartesianChartCircleWithColor(color));
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
  return cy.findAllByTestId("echarts-tooltip").should(($elements) => {
    // Use a custom function to check if the fixed-position tooltip is visible,
    // as Cypress's ":visible" or "be.visible" fails to identify a fixed-position tooltip as visible.
    const visibleTooltips = $elements
      .toArray()
      .filter(isFixedPositionElementVisible);

    // Assert we have exactly one visible tooltip
    expect(visibleTooltips).to.have.length(
      1,
      "there must be only one visible echarts tooltip",
    );

    const visibleTooltip = visibleTooltips[0];

    const tooltipContainerStyle = window.getComputedStyle(
      visibleTooltip.closest(".echarts-tooltip-container"),
    );

    // (metabase#51904): tooltip container must render above the fold in the Embedding SDK.
    // ensures that we are using fixed-positioned tooltips.
    expect(tooltipContainerStyle.position).to.equal("fixed");

    // (metabase#52732): tooltip container must have the correct z-index (201)
    // this assertion prevents the tooltip from being rendered below charts or modals.
    expect(Number(tooltipContainerStyle.zIndex)).to.equal(201);

    // Return the visible tooltip
    return visibleTooltip;
  });
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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
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
  echartsTooltip().within(() => {
    if (header != null) {
      tooltipHeader().should("have.text", header);
    }

    if (rows != null) {
      rows.forEach((row) => {
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
    rows.forEach((row) => {
      cy.findByText(row).should("not.exist");
    });
  });
}
