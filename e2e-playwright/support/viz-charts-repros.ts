/**
 * Helpers for the visualizations-charts-reproductions spec port
 * (e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.ts).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). These are ports of `H` helpers not (yet) in the
 * shared support modules, plus a couple of spec-local helpers:
 *  - e2e-visual-tests-helpers.js (chartGridLines, cartesianChartCircleWithColor,
 *    echartsTriggerBlur, the full assertEChartsTooltip with footer/secondaryValue)
 *  - e2e-viz-settings-helpers.js (vizSettingsSidebar)
 *  - e2e-ui-elements-helpers.js  (openObjectDetail)
 *  - e2e-misc-helpers.js         (saveSavedQuestion)
 *  - api/addQuestionToDashboard.ts
 *
 * Consolidation candidates flagged inline. The header/rows-only
 * assertEChartsTooltip already lives in viz-tabular-repros.ts; this one adds
 * footer + secondaryValue + blurAfter, so fold them together on consolidation.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { visitNativeQuestionAdhoc } from "./charts-extras";
import { visitQuestionAdhoc } from "./permissions";

type Scope = Page | Locator | FrameLocator;

/**
 * The spike's visitQuestionAdhoc / visitNativeQuestionAdhoc take a narrow
 * AdhocQuestion type without `name` / `visualization_settings`, though
 * adhocQuestionHash spreads every key at runtime. These wrappers widen the
 * literal (like viz-tabular-repros does) so the spec can pass the same shapes
 * the Cypress original does; the cast is safe because the extra keys are
 * forwarded verbatim into the URL hash.
 */
type AdhocWithSettings = Parameters<typeof visitQuestionAdhoc>[1] & {
  name?: string;
  visualization_settings?: Record<string, unknown>;
};

export function visitAdhoc(page: Page, question: AdhocWithSettings) {
  return visitQuestionAdhoc(
    page,
    question as Parameters<typeof visitQuestionAdhoc>[1],
  );
}

export function visitNativeAdhoc(page: Page, question: AdhocWithSettings) {
  return visitNativeQuestionAdhoc(
    page,
    question as Parameters<typeof visitNativeQuestionAdhoc>[1],
  );
}

// The white line-chart point markers this spec queries for the "data points
// off screen" repro (UXW-2696).
const WHITE_POINT_FILL = "hsla(0, 0%, 100%, 1.00)";

/**
 * Port of H.chartGridLines (e2e-visual-tests-helpers.js). Not scoped to
 * chart-container: the Cypress helper's echartsContainer().find(...) is only
 * ever used at page level here.
 */
export function chartGridLines(page: Page): Locator {
  return page
    .getByTestId("chart-container")
    .locator(
      "path[stroke='var(--mb-color-cartesian-grid-line)'][fill='none']",
    );
}

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

/**
 * Port of H.cartesianChartCircleWithColor: the line/area data-point markers of
 * a given stroke color. The Cypress helper appends `.should("be.visible")`;
 * call sites here add the equivalent visibility assertion (or hover, whose
 * actionability check waits for the same).
 */
export function cartesianChartCircleWithColor(
  page: Page,
  color: string,
): Locator {
  return page
    .getByTestId("chart-container")
    .locator(`path[d="${CIRCLE_PATH}"][stroke="${color}"]`);
}

/**
 * Port of H.echartsTriggerBlur: hover the right edge of the chart to dismiss
 * the tooltip, then wait for it to fade (the Cypress helper waits 700ms).
 */
export async function echartsTriggerBlur(page: Page) {
  const container = page.getByTestId("chart-container");
  const box = await container.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  }
  await page.waitForTimeout(700);
}

/** Port of H.echartsTooltip: the single visible tooltip DOM instance. */
export function echartsTooltip(page: Page): Locator {
  return page.getByTestId("echarts-tooltip").filter({ visible: true });
}

type TooltipRow = {
  name: string;
  color?: string;
  value?: string | number;
  secondaryValue?: string | number;
  index?: number;
};

type TooltipFooter = {
  name?: string;
  value?: string | number;
  secondaryValue?: string | number;
};

/**
 * Port of H.assertEChartsTooltip ({ header, rows, footer, blurAfter }). The
 * Cypress row/footer text assertions are testing-library findByText (exact),
 * ported as exact getByText. Numeric values are stringified (findByText coerces
 * numbers).
 */
export async function assertEChartsTooltip(
  page: Page,
  {
    header,
    rows,
    footer,
    blurAfter,
  }: {
    header?: string;
    rows?: TooltipRow[];
    footer?: TooltipFooter;
    blurAfter?: boolean;
  },
) {
  const tooltip = echartsTooltip(page);

  if (header != null) {
    await expect(tooltip.getByTestId("echarts-tooltip-header")).toHaveText(
      header,
    );
  }

  if (rows != null) {
    for (const { name, color, value, secondaryValue, index } of rows) {
      const row = tooltip
        .getByText(name, { exact: true })
        .nth(index ?? 0)
        .locator("xpath=ancestor-or-self::tr[1]");
      if (color) {
        await expect(
          row.locator("td").first().locator("span"),
        ).toHaveClass(new RegExp(`marker-${color.replace("#", "")}`));
      }
      // Cypress assertTooltipRow guards with `if (value)` / `if (secondaryValue)`
      // (truthiness) — skip falsy (0, "") rather than over-asserting blank cells.
      if (value) {
        await expect(
          row.getByText(String(value), { exact: true }),
        ).toBeVisible();
      }
      if (secondaryValue) {
        await expect(
          row.getByText(String(secondaryValue), { exact: true }),
        ).toBeVisible();
      }
    }
  }

  if (footer != null) {
    const footerEl = tooltip.getByTestId("echarts-tooltip-footer");
    // Cypress assertTooltipFooter guards with `if (name)` / `if (value)` /
    // `if (secondaryValue)` (truthiness) — skip falsy rather than over-assert.
    if (footer.name) {
      await expect(
        footerEl.getByText(String(footer.name), { exact: true }),
      ).toBeVisible();
    }
    if (footer.value) {
      await expect(
        footerEl.getByText(String(footer.value), { exact: true }),
      ).toBeVisible();
    }
    if (footer.secondaryValue) {
      await expect(
        footerEl.getByText(String(footer.secondaryValue), { exact: true }),
      ).toBeVisible();
    }
  }

  if (blurAfter) {
    await echartsTriggerBlur(page);
  }
}

/** Port of H.vizSettingsSidebar (e2e-viz-settings-helpers.js). */
export function vizSettingsSidebar(page: Page): Locator {
  return page.getByTestId("chartsettings-sidebar");
}

/**
 * Port of H.openObjectDetail(rowIndex): hover the row, then click the
 * (hover-gated) detail-shortcut. The Cypress version realHovers with
 * scrollBehavior:false and force-clicks; hover + force click matches.
 */
export async function openObjectDetail(page: Page, rowIndex: number) {
  // The table renders two role="row" elements per data-index (frozen + scroll
  // layers); only the one carrying the detail-shortcut is the real target.
  const row = page
    .locator(`[data-index="${rowIndex}"]`)
    .filter({ has: page.getByTestId("detail-shortcut") })
    .first();
  await row.hover();
  await row.getByTestId("detail-shortcut").click({ force: true });
}

/**
 * Port of H.saveSavedQuestion (e2e-misc-helpers.js): overwrite an already-saved
 * question. Clicks Save in the QB header, confirms in the modal, waits for the
 * PUT /api/card/:id.
 */
export async function saveSavedQuestion(page: Page) {
  const putResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByTestId("save-question-modal")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await putResponse;
}

/**
 * Port of api/addQuestionToDashboard.ts: GET the dashboard, append a dashcard
 * for the card with sane default size/position, PUT it back.
 */
export async function addQuestionToDashboard(
  api: MetabaseApi,
  { dashboardId, cardId }: { dashboardId: number; cardId: number },
) {
  const { body } = await api.getDashboard(dashboardId);
  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      ...(body.dashcards ?? []),
      { id: -1, card_id: cardId, row: 0, col: 0, size_x: 11, size_y: 8 },
    ],
  });
}

// === UXW-2696 spec-local helpers (data points off screen) ===

/**
 * Port of the spec-local getChartPoints: the white line-chart point markers.
 * The Cypress original is `H.echartsContainer().get("path[fill=...]")` — .get()
 * discards the previous subject, so this is really just "matching paths within
 * the current scope" (the enclosing `within` block). Ported as a scope-taking
 * locator so the pinned-card / document-card / dashcard `within` blocks map to
 * a scoped Locator.
 */
export function getChartPoints(scope: Scope): Locator {
  return (scope as Page).locator(`path[fill='${WHITE_POINT_FILL}']`);
}

/** Port of the spec-local getNoPointsMessage. */
export function getNoPointsMessage(scope: Scope): Locator {
  return (scope as Page).getByRole("dialog", {
    name: /data points are off screen/i,
  });
}

/** Port of the spec-local assertNoPoints. */
export async function assertNoPoints(scope: Scope, assertMessage = true) {
  await expect(getChartPoints(scope)).toHaveCount(0);
  if (assertMessage) {
    await expect(getNoPointsMessage(scope)).toBeVisible();
  }
}

/** Port of the spec-local assertDataVisible. */
export async function assertDataVisible(scope: Scope) {
  await expect(getChartPoints(scope).first()).toBeVisible();
  await expect(getNoPointsMessage(scope)).toHaveCount(0);
}

/**
 * Port of H.moveDnDKitElementByAlias(alias, { vertical, useMouseEvents: true }):
 * the synthetic MouseEvent sequence (mousedown at the element's top-left, an
 * initial +20/+20 move to clear the sensor activation constraint, the real
 * move, then a document-level mouseup). Identical to
 * question-settings.moveDnDKitElementSynthetic — a consolidation candidate.
 */
export async function moveDnDKitElementVertically(
  element: Locator,
  vertical: number,
) {
  await element.evaluate(async (el, vertical) => {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const options = { bubbles: true, cancelable: true, button: 0 };
    const { x, y } = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("mousedown", { ...options, clientX: x, clientY: y }),
    );
    await sleep(200);
    el.dispatchEvent(
      new MouseEvent("mousemove", {
        ...options,
        clientX: x + 20,
        clientY: y + 20,
      }),
    );
    await sleep(200);
    el.dispatchEvent(
      new MouseEvent("mousemove", {
        ...options,
        clientX: x,
        clientY: y + vertical,
      }),
    );
    await sleep(200);
    document.dispatchEvent(
      new MouseEvent("mouseup", {
        ...options,
        clientX: x,
        clientY: y + vertical,
      }),
    );
    await sleep(200);
  }, vertical);
}
