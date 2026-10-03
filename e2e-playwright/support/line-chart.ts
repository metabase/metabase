/**
 * Helpers for the line-chart spec port
 * (e2e/test/scenarios/visualizations-charts/line_chart.cy.spec.js).
 *
 * New helpers for this spec only, per the porting rules (parallel agents never
 * edit shared support files). Ports of `H` helpers not (yet) in the shared
 * modules, plus a couple of spec-local utilities:
 *  - e2e-viz-settings-helpers.js (openSeriesSettings)
 *  - e2e-visual-tests-helpers.js (getXYTransform)
 *  - the widened visitQuestionAdhoc wrappers (like viz-charts-repros)
 *
 * Consolidation note: openSeriesSettings / the widened adhoc wrappers belong
 * in charts.ts / charts-extras.ts at consolidation time.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { echartsContainer } from "./charts";
import { visitNativeQuestionAdhoc } from "./charts-extras";
import { visitQuestionAdhoc } from "./permissions";

/**
 * The spike's visitQuestionAdhoc / visitNativeQuestionAdhoc take a narrow
 * AdhocQuestion type without `name` / `visualization_settings`, though
 * adhocQuestionHash spreads every key into the URL hash at runtime. These
 * wrappers widen the literal (like viz-charts-repros does) so the spec can pass
 * the same shapes the Cypress original does.
 */
type AdhocWithSettings = Parameters<typeof visitQuestionAdhoc>[1] & {
  name?: string;
  visualization_settings?: Record<string, unknown>;
};

export function visitLineChartAdhoc(page: Page, question: AdhocWithSettings) {
  return visitQuestionAdhoc(
    page,
    question as Parameters<typeof visitQuestionAdhoc>[1],
  );
}

export function visitNativeLineChartAdhoc(
  page: Page,
  question: AdhocWithSettings,
) {
  return visitNativeQuestionAdhoc(
    page,
    question as Parameters<typeof visitNativeQuestionAdhoc>[1],
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ECharts SVG `<text>` carries leading/trailing spaces, and Playwright's
 * getByText does NOT trim (unlike testing-library findByText). So an exact
 * findByText port matches nothing; anchor a whitespace-tolerant regex instead
 * so "0"/"8"/"100%" stay exact matches rather than loose substrings.
 */
export function echartsExactText(page: Page, text: string): Locator {
  return echartsContainer(page).getByText(
    new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`),
  );
}

/**
 * Port of H.openSeriesSettings(field, isBreakout): open a series' settings
 * popover from the viz-settings sidebar. For breakout series the picker is a
 * draggable-item; otherwise it is the chart-setting-select whose current value
 * matches `field` (a Mantine Select input — read via inputValue()).
 */
export async function openSeriesSettings(
  page: Page,
  field: string,
  isBreakout = false,
) {
  if (isBreakout) {
    const item = page
      .locator("[data-testid^=draggable-item]")
      .filter({ hasText: field })
      .first();
    await item.locator(".Icon-ellipsis").click({ force: true });
    return;
  }
  const index = await chartSettingSelectIndex(page, field);
  await chartSettingFieldPicker(page, index)
    .locator(".Icon-ellipsis")
    .click({ force: true });
}

/** The chartsettings-field-picker enclosing the index-th chart-setting-select. */
function chartSettingFieldPicker(page: Page, index: number): Locator {
  return page
    .getByTestId("chart-setting-select")
    .nth(index)
    .locator(
      "xpath=ancestor-or-self::*[@data-testid='chartsettings-field-picker'][1]",
    );
}

/** Index of the chart-setting-select whose current value equals `value`. */
async function chartSettingSelectIndex(
  page: Page,
  value: string,
): Promise<number> {
  const selects = page.getByTestId("chart-setting-select");
  const count = await selects.count();
  for (let index = 0; index < count; index++) {
    if ((await selects.nth(index).inputValue()) === value) {
      return index;
    }
  }
  throw new Error(`No chart-setting-select with value "${value}"`);
}

/** The current values of every chart-setting-select, in DOM order. */
export async function chartSettingSelectValues(page: Page): Promise<string[]> {
  const selects = page.getByTestId("chart-setting-select");
  const count = await selects.count();
  const values: string[] = [];
  for (let index = 0; index < count; index++) {
    values.push(await selects.nth(index).inputValue());
  }
  return values;
}

/** Assert the field-picker for `value` renders a grabber (drag) icon. */
export async function expectFieldPickerHasGrabber(page: Page, value: string) {
  const index = await chartSettingSelectIndex(page, value);
  await expect(
    chartSettingFieldPicker(page, index).locator(".Icon-grabber"),
  ).toBeAttached();
}

/**
 * Port of getXYTransform: read the {x, y} translation of an SVG element from
 * its transform matrix (Cypress reads element.prop("transform").baseVal[0].matrix).
 */
export function getXYTransform(
  element: Locator,
): Promise<{ x: number; y: number }> {
  return element.evaluate((node) => {
    const matrix = (node as unknown as SVGGraphicsElement).transform.baseVal[0]
      .matrix;
    return { x: matrix.e, y: matrix.f };
  });
}

/**
 * Port of Cypress's `.trigger("mousemove")` on a chart element: dispatch a
 * synthetic mousemove at the element's center. ECharts (zrender) hit-tests the
 * tooltip from the event's clientX/clientY, and a real-mouse `hover()` fails to
 * register on edge points (e.g. the first data point sitting on the y-axis), so
 * the synthetic dispatch — which is exactly what Cypress does — is both faithful
 * and reliable here.
 */
export async function triggerMousemove(element: Locator) {
  await element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2,
      }),
    );
  });
}

/**
 * Port of the spec's `cy.findByTestId("query-visualization-root").trigger(
 * mousedown/mousemove/mouseup, x, y)` brush: a real-mouse drag across the
 * visualization at coordinates relative to its top-left corner.
 */
export async function brushChart(
  page: Page,
  fromX: number,
  toX: number,
  y: number,
) {
  const root = page.getByTestId("query-visualization-root");
  const box = await root.boundingBox();
  if (!box) {
    throw new Error("query-visualization-root is not visible");
  }
  await page.mouse.move(box.x + fromX, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + toX, box.y + y, { steps: 10 });
  await page.mouse.up();
}
