import { color as echartsColor, getInstanceByDom } from "echarts/core";

import { fireEvent, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { isObject } from "metabase-types/guards";

/**
 * A zrender element of a chart: "path" for line points and scatter bubbles,
 * "rect" for bars, "sector" for pie slices. A point or bubble matches its
 * color by stroke or fill.
 */
export type ChartElementTarget = {
  type: "path" | "rect" | "sector";
  color: string;
  /** The index of the element among the matching ones, from left to right */
  index?: number;
};

/** The chart root inside a container, or the container when it is the root */
export function getChartRoot(container: HTMLElement = document.body) {
  return container.dataset.testid === "chart-container"
    ? container
    : within(container).getByTestId("chart-container");
}

function getZr(chartRoot: HTMLElement) {
  return checkNotNull(getInstanceByDom(chartRoot)).getZr();
}

function getChartSurface(chartRoot: HTMLElement) {
  return checkNotNull(chartRoot.querySelector("svg"));
}

const toRgb = (color: string) => echartsColor.parse(color).slice(0, 3).join();

/**
 * ECharts restyles a hovered element with its color in another notation, and
 * fades the other series, so colors match by their red, green and blue.
 */
function isSameColor(value: unknown, color: string) {
  return typeof value === "string" && toRgb(value) === toRgb(color);
}

function getMatchingElements(
  chartRoot: HTMLElement,
  { type, color }: ChartElementTarget,
) {
  return (
    getZr(chartRoot)
      .storage.getDisplayList()
      .filter(
        (element) =>
          element.type === type &&
          (isSameColor(element.style.fill, color) ||
            isSameColor(element.style.stroke, color)),
      )
      .map((element) => {
        const rect = element.getBoundingRect().clone();
        rect.applyTransform(element.getComputedTransform());
        return { element, rect };
      })
      // an element without area paints nothing
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => a.rect.x - b.rect.x)
  );
}

/** The number of chart elements of a type and color that paint something */
export function countChartElements(
  chartRoot: HTMLElement,
  target: Omit<ChartElementTarget, "index">,
) {
  return getMatchingElements(chartRoot, target).length;
}

/**
 * The coordinates of a point that hits a chart element. zrender finds the
 * hovered element by geometry rather than by DOM target.
 */
export function getChartElementPoint(
  chartRoot: HTMLElement,
  target: ChartElementTarget,
) {
  const zr = getZr(chartRoot);
  const { element, rect } = checkNotNull(
    getMatchingElements(chartRoot, target).at(target.index ?? 0),
  );
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = rect.x + (rect.width * i) / STEPS;
      const y = rect.y + (rect.height * j) / STEPS;
      if (zr.handler.findHover(x, y).target === element) {
        return { x, y, rect };
      }
    }
  }
  throw new Error(`No point hits the ${target.type} at ${target.index ?? 0}`);
}

/** Waits until no chart element animates, so elements have their final style */
export async function waitForChartIdle(chartRoot: HTMLElement) {
  await waitFor(() =>
    expect(
      getZr(chartRoot)
        .storage.getDisplayList()
        .every((element) => element.animators.length === 0),
    ).toBe(true),
  );
}

/** Moves the mouse away from every chart element, which hides the tooltip */
export async function blurChart(chartRoot: HTMLElement) {
  fireEvent.mouseMove(getChartSurface(chartRoot), { clientX: 0, clientY: 0 });
  await waitForChartIdle(chartRoot);
}

/**
 * Moves the mouse over a chart element. ECharts draws a hovered element in
 * another style, so this finds the element once nothing is hovered.
 */
export async function hoverChartElement(
  chartRoot: HTMLElement,
  target: ChartElementTarget,
) {
  await blurChart(chartRoot);
  const { x, y } = getChartElementPoint(chartRoot, target);
  fireEvent.mouseMove(getChartSurface(chartRoot), { clientX: x, clientY: y });
}

/** Clicks a chart element as a mouse does: move, press, release, click */
export async function clickChartElement(
  chartRoot: HTMLElement,
  target: ChartElementTarget,
) {
  await blurChart(chartRoot);
  const { x, y } = getChartElementPoint(chartRoot, target);
  const surface = getChartSurface(chartRoot);
  const coords = { clientX: x, clientY: y };
  fireEvent.mouseMove(surface, coords);
  fireEvent.mouseDown(surface, coords);
  fireEvent.mouseUp(surface, coords);
  fireEvent.click(surface, coords);
}

function isTooltipShown(tooltip: HTMLElement) {
  // ECharts hides a tooltip by its root's inline style
  const root = tooltip.parentElement;
  return root?.style.visibility !== "hidden" && root?.style.display !== "none";
}

/** The ECharts tooltips that are shown, one at most */
export function queryShownTooltips() {
  return screen.queryAllByTestId("echarts-tooltip").filter(isTooltipShown);
}

function formatCell(cell: HTMLElement) {
  const marker = cell.querySelector("span[class*='marker-']");
  const markerClass = Array.from(marker?.classList ?? []).find((name) =>
    name.startsWith("marker-"),
  );
  return markerClass != null
    ? `#${markerClass.replace("marker-", "")}`
    : (cell.textContent ?? "");
}

function formatRow(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map(formatCell)
    .filter((text) => text !== "")
    .join(" | ");
}

export type TooltipContent = {
  header: string | null;
  /** The rows as "marker color | name | value | other values" */
  rows: string[];
  footer: string | null;
};

/** What a tooltip shows: its header, rows and footer */
export function getTooltipContent(tooltip: HTMLElement): TooltipContent {
  const [body, foot] = within(tooltip).getAllByRole("rowgroup");
  return {
    header:
      within(tooltip).queryByTestId("echarts-tooltip-header")?.textContent ??
      null,
    rows: within(body).queryAllByRole("row").map(formatRow),
    footer: foot != null ? formatRow(within(foot).getByRole("row")) : null,
  };
}

/** Waits until the shown tooltip has exactly this content */
export async function expectTooltip(expected: Partial<TooltipContent>) {
  await waitFor(() => {
    const [tooltip] = queryShownTooltips();
    expect(tooltip).toBeDefined();
    expect(getTooltipContent(tooltip)).toEqual({
      header: null,
      footer: null,
      ...expected,
    });
  });
}

/** The axis labels, legends excluded, that a chart draws */
export function getChartTexts(chartRoot: HTMLElement) {
  return Array.from(
    chartRoot.querySelectorAll("text"),
    (text) => text.textContent?.trim() ?? "",
  );
}

/**
 * Where the chart's tooltip option places a tooltip of a size, for a pointer at
 * chart coordinates. jsdom has no layout for ECharts to place the element.
 */
export function getTooltipPlacement(
  chartRoot: HTMLElement,
  pointer: [x: number, y: number],
  contentSize: [width: number, height: number],
): [left: number, top: number] {
  const { tooltip } = checkNotNull(getInstanceByDom(chartRoot)).getOption();
  const [option] = Array.isArray(tooltip) ? tooltip : [tooltip];
  const position: unknown = isObject(option) ? option.position : undefined;
  if (typeof position !== "function") {
    throw new Error("The chart has no tooltip position function");
  }
  const placement: unknown = position(pointer, null, null, null, {
    contentSize,
  });
  if (
    !Array.isArray(placement) ||
    typeof placement[0] !== "number" ||
    typeof placement[1] !== "number"
  ) {
    throw new Error("The tooltip position function returned no coordinates");
  }
  return [placement[0], placement[1]];
}
