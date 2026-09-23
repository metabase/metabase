/**
 * Helpers for the metrics explorer (/explore) spec:
 * - MetricsViewer (e2e-metrics-viewer-helpers.ts)
 * - ensureChartIsActive / applyBrush / splitPanelAxisLines / echartsTooltip
 *   (e2e-visual-tests-helpers.js)
 * - createMeasure (e2e-table-metadata-helpers.js)
 * - createMetric (H.createQuestion, incl. fields the spike api helper lacks)
 * - resetDecimalPkTable (H.resetTestTable({ table: "decimal_pk_table" }))
 *
 * Kept separate from the shared support/*.ts files because those are edited
 * by parallel porting agents; fold into metrics.ts/charts.ts at consolidation.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { echartsContainer } from "./charts";
import { cartesianChartCircles } from "./metrics";
import { SAMPLE_DB_ID } from "./sample-data";
import { queryWritableDB } from "./schema-viewer";

export const MetricsViewer = {
  goToViewer: (page: Page) => page.goto("/explore"),

  formulaInput: (page: Page): Locator =>
    page.getByTestId("metrics-formula-input"),

  /**
   * Port of MetricsViewer.searchInput(): click the right edge of the formula
   * container to focus the CodeMirror input without accidentally hitting a
   * pill (which would trigger the swap-metric flow), then return the input.
   *
   * MetricSearchInput renders collapsed pills while unfocused and only mounts
   * the CodeMirror editor once the container is clicked, autofocusing it from
   * an effect. The click resolves before that effect runs, so keystrokes sent
   * straight after it are silently dropped (a lost "+" turns an expression
   * into two separate metric pills). Wait for the editor's contenteditable to
   * actually hold focus — same guard as focusNativeEditor in native-editor.ts.
   */
  searchInput: async (page: Page): Promise<Locator> => {
    const formula = MetricsViewer.formulaInput(page);
    const box = await formula.boundingBox();
    if (!box) {
      throw new Error("metrics-formula-input is not visible");
    }
    await formula.click({ position: { x: box.width - 5, y: box.height / 2 } });
    const input = page.getByTestId("metrics-viewer-search-input");
    await expect(input.locator(".cm-content")).toBeFocused();
    return input;
  },

  searchBarPills: (page: Page): Locator =>
    page.locator(
      "[data-testid='metrics-viewer-pill'], [data-testid='metrics-viewer-expression-pill']",
    ),

  breakoutLegend: (page: Page): Locator =>
    page.getByTestId("metrics-viewer-breakout-legend"),

  getFilterButton: (page: Page): Locator =>
    page.getByRole("button", { name: /Filter/ }),

  getAllFilterPills: (page: Page): Locator =>
    page.getByTestId("metrics-viewer-filter-pill"),

  getDimensionPillBarContainer: (page: Page): Locator =>
    page.getByTestId("metrics-viewer-dimension-pill-bar"),

  dimensionPickerSidebar: (page: Page): Locator =>
    page.getByTestId("metrics-viewer-dimension-picker-sidebar"),

  getColumnPickerButton: (page: Page): Locator =>
    MetricsViewer.getMetricControls(page).getByLabel("Change column", {
      exact: true,
    }),

  openDimensionPickerSidebar: async (page: Page): Promise<Locator> => {
    await MetricsViewer.getColumnPickerButton(page).click();
    return MetricsViewer.dimensionPickerSidebar(page);
  },

  closeDimensionPickerSidebar: (page: Page) =>
    MetricsViewer.dimensionPickerSidebar(page)
      .getByLabel("Close", { exact: true })
      .click(),

  getMetricVisualization: (page: Page): Locator =>
    page.getByTestId("visualization-root"),

  /**
   * Port of MetricsViewer.getMetricVisualizationDataPoints. Upstream chains
   * cy.get() off the visualization, but a chained cy.get ignores its subject
   * and queries the whole document — mirror that (page-level) semantics.
   */
  getMetricVisualizationDataPoints: (page: Page): Locator =>
    page.locator("path[fill='hsla(0, 0%, 100%, 1.00)']"),

  getAllMetricVisualizations: (page: Page): Locator =>
    page.getByTestId("visualization-root"),

  assertVizType: async (page: Page, displayType: string) => {
    await expect(MetricsViewer.getMetricVisualization(page)).toHaveAttribute(
      "data-viz-ui-name",
      displayType,
    );
  },

  assertAllVizTypes: async (
    page: Page,
    displayType: string,
    expectedLength?: number,
  ) => {
    const all = MetricsViewer.getAllMetricVisualizations(page);
    if (expectedLength !== undefined) {
      await expect(all).toHaveCount(expectedLength);
    }
    const count = await all.count();
    for (let index = 0; index < count; index++) {
      await expect(all.nth(index)).toHaveAttribute(
        "data-viz-ui-name",
        displayType,
      );
    }
  },

  getMetricControls: (page: Page): Locator =>
    page.getByTestId("metrics-viewer-controls"),

  changeVizType: (page: Page, display: string) =>
    MetricsViewer.getMetricControls(page)
      .getByRole("button", { name: display, exact: true })
      .click(),

  runButton: (page: Page): Locator => page.getByTestId("run-expression-button"),
};

/** The next POST /api/metric/dataset response (the "@dataset" alias).
 * Register BEFORE the triggering action, await after. */
export function waitForMetricDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/metric/dataset",
  );
}

/** The next GET /api/metric/:id response (the "@getMetric" alias). */
export function waitForGetMetric(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/metric\/[^/]+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of H.ensureChartIsActive: DebouncedFrame disables pointer events
 * while transitioning; wait for it to settle and the chart svg to exist.
 */
export async function ensureChartIsActive(page: Page) {
  const frames = page.getByTestId("debounced-frame-root");
  const count = await frames.count();
  for (let index = 0; index < count; index++) {
    await expect(frames.nth(index)).not.toHaveCSS("pointer-events", "none");
  }
  // Upstream cy.wait(500): let DebouncedFrame transitions settle.
  await page.waitForTimeout(500);
  await expect(echartsContainer(page).locator("svg")).toHaveCount(1);
}

/**
 * Port of H.applyBrush: drag horizontally across the chart at y=100
 * (coordinates relative to the echarts container, like cy.trigger's x/y).
 */
export async function applyBrush(page: Page, left: number, right: number) {
  const box = await echartsContainer(page).boundingBox();
  if (!box) {
    throw new Error("echarts container is not visible");
  }
  const y = box.y + 100;
  await page.mouse.move(box.x + left, y);
  await page.mouse.down();
  await page.mouse.move(box.x + right, y, { steps: 10 });
  await page.mouse.up();
}

/**
 * Port of H.splitPanelAxisLines. The stroke mirrors color("border-strong")
 * from metabase/ui/colors (light theme, orionAlpha[30]); this package has no
 * path alias into frontend/src, so the value is inlined like TREND_LINE_DASH.
 */
const BORDER_STRONG = "hsla(204, 66%, 8%, 0.29)";

export function splitPanelAxisLines(page: Page): Locator {
  return echartsContainer(page).locator(`path[stroke="${BORDER_STRONG}"]`);
}

/**
 * Port of H.echartsTooltip: ECharts may keep two DOM instances of the
 * tooltip; match the visible one. (The upstream fixed-position/z-index
 * regression assertions are Cypress-visibility workarounds — Playwright's
 * visibility check handles fixed-position elements natively.)
 */
export function echartsTooltip(page: Page): Locator {
  return page.getByTestId("echarts-tooltip").locator("visible=true");
}

/**
 * Hover a cartesian chart point until the ECharts tooltip shows `expectedText`,
 * and return the (visible) tooltip locator.
 *
 * Two CI-only failure modes make a plain `circle.nth(i).hover()` +
 * `expect(tooltip.getByText(...)).toBeVisible()` flaky, both from the chart
 * still moving after a breakout/metric change re-renders it:
 *   1. the hover fires while the point is animating, lands on empty canvas, and
 *      no tooltip appears (metrics-explorer:1131 on the first sharded run);
 *   2. the tooltip flashes up — passing a container-only check — then ECharts
 *      hides it again before the caller asserts the text, so the DOM snapshot
 *      at failure shows no tooltip at all (metrics-explorer:1220 on the second).
 * Both passed locally because the animation had settled by hover time.
 *
 * So: wait for the chart to go interactive, then retry the *entire*
 * hover-and-assert-text as one unit — a tooltip that vanishes is simply
 * re-triggered on the next attempt. The assertion is not weakened: the exact
 * text must be visible for the retry to succeed. Callers add their negative
 * assertions (stale name absent) after, on the now-stable tooltip.
 */
export async function hoverChartPointForTooltip(
  page: Page,
  expectedText: string,
  index = 4,
): Promise<Locator> {
  await ensureChartIsActive(page);
  const tooltip = echartsTooltip(page);
  await expect(async () => {
    // Nudge the mouse off-point first so each attempt is a fresh mousemove
    // even when the point hasn't moved (ECharts ignores zero-delta moves).
    await page.mouse.move(0, 0);
    await cartesianChartCircles(page).nth(index).hover({ force: true });
    await expect(tooltip.getByText(expectedText, { exact: true })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  return tooltip;
}

/** Port of H.createMeasure (POST /api/measure). */
export async function createMeasure(
  api: MetabaseApi,
  {
    name,
    definition,
    description = null,
  }: {
    name: string;
    definition: Record<string, unknown>;
    description?: string | null;
  },
): Promise<{ id: number }> {
  const response = await api.post("/api/measure", {
    name,
    description,
    definition,
  });
  return (await response.json()) as { id: number };
}

export type MetricDetails = {
  name: string;
  type?: string;
  description?: string | null;
  display?: string;
  collection_id?: number;
  database?: number;
  query: Record<string, unknown>;
};

/**
 * Port of H.createQuestion for the metric card shapes this spec uses —
 * the spike's api.createQuestion doesn't accept description/collection_id.
 */
export async function createMetric(
  api: MetabaseApi,
  details: MetricDetails,
): Promise<{ id: number }> {
  const {
    name,
    type = "metric",
    description = null,
    display = "scalar",
    collection_id,
    database = SAMPLE_DB_ID,
    query,
  } = details;
  const response = await api.post("/api/card", {
    name,
    type,
    description,
    display,
    collection_id,
    visualization_settings: {},
    dataset_query: { type: "query", query, database },
  });
  return (await response.json()) as { id: number };
}

/** Default color of an unassigned pill indicator (orion 100 as hex). */
export const DEFAULT_PLACEHOLDER_COLOR = "#071722";

/**
 * Port of readColorsFromIndicator: the hex colors of a pill's
 * color-indicator children (multi-dot: backgroundColor; single icon: color).
 */
export function readColorsFromIndicator(pill: Locator): Promise<string[]> {
  return pill.evaluate((element) => {
    const rgbToHex = (rgb: string): string => {
      const parts = rgb.match(/[\d.]+/g) ?? [];
      const [r = 0, g = 0, b = 0] = parts.map(Number);
      const toHex = (channel: number) =>
        Math.round(channel).toString(16).padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    };
    const container = element.querySelector(
      "[data-testid='color-indicator-container']",
    );
    if (!container) {
      return [];
    }
    return Array.from(container.children).map((child) => {
      const style = window.getComputedStyle(child);
      const bg = style.backgroundColor;
      const raw =
        bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"
          ? bg
          : style.color;
      return rgbToHex(raw);
    });
  });
}

/**
 * Port of getPillColors: retried (like the upstream .should callback) until
 * the pill's colors are assigned — i.e. non-empty and not all the default
 * placeholder color.
 */
export async function getPillColors(
  page: Page,
  pillIndex: number,
): Promise<string[]> {
  const pill = MetricsViewer.searchBarPills(page).nth(pillIndex);
  let colors: string[] = [];
  await expect(async () => {
    expect(await MetricsViewer.searchBarPills(page).count()).toBeGreaterThan(
      pillIndex,
    );
    colors = await readColorsFromIndicator(pill);
    expect(
      colors.length,
      "pill should have at least one color",
    ).toBeGreaterThan(0);
    expect(
      colors.every((color) => color === DEFAULT_PLACEHOLDER_COLOR),
      "pill colors should not all be the default placeholder color",
    ).toBe(false);
  }).toPass();
  return colors;
}

/** The breakout legend's { label, color(hex) } entries, in DOM order. */
export function readLegendEntries(
  page: Page,
): Promise<{ label: string; color: string }[]> {
  return MetricsViewer.breakoutLegend(page).evaluate((legend) => {
    const rgbToHex = (rgb: string): string => {
      const parts = rgb.match(/[\d.]+/g) ?? [];
      const [r = 0, g = 0, b = 0] = parts.map(Number);
      const toHex = (channel: number) =>
        Math.round(channel).toString(16).padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    };
    return Array.from(
      legend.querySelectorAll("[data-testid='breakout-legend-dot']"),
    ).map((dot) => ({
      label: dot.nextElementSibling?.textContent ?? "",
      color: rgbToHex(window.getComputedStyle(dot).backgroundColor),
    }));
  });
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "decimal_pk_table" })
 * — the table shape lives in e2e/support/test_tables.js.
 */
export async function resetDecimalPkTable() {
  await queryWritableDB(`
    drop table if exists "decimal_pk_table";
    create table "decimal_pk_table" (
      "id" decimal(38, 0) primary key,
      "name" varchar(255)
    );
    insert into "decimal_pk_table" ("id", "name") values
      (-9223372036854775809, 'Negative'),
      (0, 'Zero'),
      (9223372036854775808, 'Positive');
  `);
}
