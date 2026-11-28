import { getInstanceByDom } from "echarts/core";
import { platformApi, setPlatformAPI } from "zrender/lib/core/platform.js";

import { fireEvent, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

type ChartElementStyle = {
  fill?: unknown;
  stroke?: unknown;
  opacity?: unknown;
};

export type ChartElementPredicate = (style: ChartElementStyle) => boolean;

export type ChartPoint = { x: number; y: number };

export type ChartRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

export const withFill =
  (fill: string): ChartElementPredicate =>
  (style) =>
    style.fill === fill;

/** The paths ECharts draws with a fill color: bars, areas and legend dots */
export function getPathsWithFill(chart: Element, color: string) {
  return chart.querySelectorAll(`path[fill='${color}']`);
}

/** The data point circles of line and area series of a color */
export function getCirclesWithStroke(chart: Element, color: string) {
  return chart.querySelectorAll(`path[d='${CIRCLE_PATH}'][stroke='${color}']`);
}

/** The labels drawn on data points ("Show values on data points") */
export function getValueLabels(chart: Element) {
  return Array.from(
    chart.querySelectorAll("text[stroke-width='3']"),
    (text) => text.textContent ?? "",
  );
}

/** The trimmed contents of every SVG text, in document order */
export function getChartTexts(chart: Element) {
  return Array.from(chart.querySelectorAll("text"), (text) =>
    (text.textContent ?? "").trim(),
  );
}

/** The SVG text elements whose trimmed content is one of `labels` */
export function getChartTextElements(chart: Element, labels: string[]) {
  return Array.from(chart.querySelectorAll("text")).filter((text) =>
    labels.includes((text.textContent ?? "").trim()),
  );
}

function getChartElements(chart: HTMLElement, isTarget: ChartElementPredicate) {
  const zr = checkNotNull(getInstanceByDom(chart)).getZr();
  return (
    zr.storage
      .getDisplayList()
      .filter((element) => isTarget(element.style))
      .map((element) => {
        const rect = element.getBoundingRect().clone();
        rect.applyTransform(element.getComputedTransform());
        return { element, rect };
      })
      // an element without area paints nothing
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y)
  );
}

/**
 * The rects of the chart elements that match, from left to right. jsdom has no
 * layout, but zrender lays out the chart itself, so these are the real sizes.
 */
export function getChartElementRects(
  chart: HTMLElement,
  isTarget: ChartElementPredicate,
): ChartRect[] {
  return getChartElements(chart, isTarget).map(({ rect }) => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }));
}

/**
 * The rects of the chart texts whose trimmed content matches, as zrender lays
 * them out, in drawing order.
 */
export function getChartTextRects(
  chart: HTMLElement,
  isTarget: (text: string) => boolean,
): ChartRect[] {
  const zr = checkNotNull(getInstanceByDom(chart)).getZr();
  return zr.storage
    .getDisplayList()
    .filter((element) => {
      const text: unknown = Reflect.get(element.style, "text");
      return typeof text === "string" && isTarget(text.trim());
    })
    .map((element) => {
      const rect = element.getBoundingRect().clone();
      rect.applyTransform(element.getComputedTransform());
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
}

/**
 * The coordinates of a point that hits a chart element. zrender finds the
 * hovered element by geometry rather than by DOM target. Matching elements are
 * ordered from left to right.
 */
export function getChartElementPoint(
  chart: HTMLElement,
  isTarget: ChartElementPredicate,
  index = 0,
): ChartPoint {
  const zr = checkNotNull(getInstanceByDom(chart)).getZr();
  const { element, rect } = checkNotNull(
    getChartElements(chart, isTarget).at(index),
  );
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = rect.x + (rect.width * i) / STEPS;
      const y = rect.y + (rect.height * j) / STEPS;
      if (zr.handler.findHover(x, y).target === element) {
        return { x, y };
      }
    }
  }
  throw new Error(`No point hits the chart element at ${index}`);
}

/** Fails unless an element of the color has area and a point of it can be hovered */
export function expectVisibleBar(chart: HTMLElement, fill: string) {
  expect(() => getChartElementPoint(chart, withFill(fill))).not.toThrow();
}

export function hoverChartPoint(chart: HTMLElement, { x, y }: ChartPoint) {
  fireEvent.mouseMove(checkNotNull(chart.querySelector("svg")), {
    clientX: x,
    clientY: y,
  });
}

export function hoverChartElement(
  chart: HTMLElement,
  isTarget: ChartElementPredicate,
  index = 0,
) {
  hoverChartPoint(chart, getChartElementPoint(chart, isTarget, index));
}

/** Moves the mouse to the empty corner of the chart */
export function unhoverChart(chart: HTMLElement) {
  hoverChartPoint(chart, { x: 1, y: 1 });
}

export type TooltipRow = {
  name: string;
  value: string;
  secondaryValue?: string;
  color?: string;
};

/** The rows of the ECharts tooltip, in order, as the user reads them */
export function getTooltipRows(tooltip: HTMLElement): TooltipRow[] {
  return Array.from(tooltip.querySelectorAll("tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const marker = cells[0]?.querySelector("span");
    const markerClass = Array.from(marker?.classList ?? []).find((name) =>
      name.startsWith("marker-"),
    );
    const texts = cells
      .slice(1)
      .map((cell) => (cell.textContent ?? "").trim())
      .filter((text) => text !== "");
    const [name = "", value = "", secondaryValue] = texts;
    return {
      name,
      value,
      ...(secondaryValue != null ? { secondaryValue } : {}),
      ...(markerClass != null
        ? { color: `#${markerClass.replace("marker-", "")}` }
        : {}),
    };
  });
}

export function getEChartsTooltip() {
  return screen.getByTestId("echarts-tooltip");
}

export function getEChartsTooltipHeader() {
  return within(getEChartsTooltip()).getByTestId("echarts-tooltip-header");
}

/** The goal line's hover marker is a transparent circle */
export const isGoalMarkerHitArea: ChartElementPredicate = (style) =>
  style.opacity === 0;

/**
 * jest-canvas-mock measures every character as 1px wide, so ECharts never
 * rotates or hides an axis label. This measures text the way a 12px browser
 * font roughly does, both for Metabase's chart layout and for zrender's text
 * layout. Call the returned function to restore the mock measurements.
 *
 * Call it in `beforeAll`, before anything draws: jest-canvas-mock binds
 * `measureText` to each canvas context when it creates it, and zrender caches
 * text widths for the life of the module.
 */
export function mockRealisticTextWidth(charWidth = 7) {
  const measure = (text: string) => String(text).length * charWidth;

  const originalPlatformMeasureText = platformApi.measureText;
  setPlatformAPI({ measureText: (text: string) => ({ width: measure(text) }) });

  const originalContextMeasureText =
    CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function (
    this: CanvasRenderingContext2D,
    text: string,
  ) {
    return Object.assign(originalContextMeasureText.call(this, text), {
      width: measure(text),
    });
  };

  return () => {
    CanvasRenderingContext2D.prototype.measureText = originalContextMeasureText;
    setPlatformAPI({ measureText: originalPlatformMeasureText });
  };
}
