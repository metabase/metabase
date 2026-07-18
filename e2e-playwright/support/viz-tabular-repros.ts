/**
 * Helpers for the visualizations-tabular-reproductions spec port
 * (e2e/test/scenarios/visualizations-tabular/visualizations-tabular-reproductions.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Consolidation candidates flagged inline.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { cartesianChartCircles } from "./metrics";
import { SAMPLE_DB_ID } from "./sample-data";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

type Scope = Page | Locator | FrameLocator;

/**
 * Port of ADMIN_USER_ID (cypress_sample_instance_data.js): the id of the
 * admin@metabase.test user. Not in support/sample-data.ts, looked up here the
 * same way that file does it.
 */
export const ADMIN_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    (user) => user.email === "admin@metabase.test",
  );
  if (!user) {
    throw new Error("admin@metabase.test not found in cypress_sample_instance_data");
  }
  return Number(user.id);
})();

/** Port of H.main() (e2e-ui-elements-helpers.js): cy.get("main"). */
export function main(page: Page): Locator {
  return page.locator("main");
}

/** Port of H.queryBuilderFooterDisplayToggle. */
export function queryBuilderFooterDisplayToggle(page: Page): Locator {
  return page.getByTestId("query-display-tabular-toggle");
}

/**
 * Thin typed wrappers over api.createQuestion — its param type omits
 * `visualization_settings` (which it forwards at runtime via `...rest`), and
 * TypeScript's excess-property check would reject it on the object literals
 * this spec passes. Consolidation candidate: widen the shared helper's type.
 */
type VizQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  collection_id?: number;
  database?: number;
  query: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
};

export function createVizQuestion(api: MetabaseApi, details: VizQuestionDetails) {
  return api.createQuestion(details);
}

/**
 * Native-question creator accepting `display` and `visualization_settings` —
 * the shared native creators (native-extras.createNativeCard,
 * models.createNativeModel) hardcode `visualization_settings: {}`, which the
 * 11435/50686 tests need to override. Mirrors H.createNativeQuestion's POST.
 */
export async function createNativeVizQuestion(
  api: MetabaseApi,
  details: {
    name?: string;
    display?: string;
    database?: number;
    native: Record<string, unknown>;
    visualization_settings?: Record<string, unknown>;
  },
): Promise<{ id: number }> {
  const {
    name = "test question",
    display = "table",
    database = SAMPLE_DB_ID,
    native,
    visualization_settings = {},
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    dataset_query: { type: "native", native, database },
  });
  return (await response.json()) as { id: number };
}

/**
 * Adhoc-question type that (unlike permissions.visitQuestionAdhoc's) includes
 * `name` and `visualization_settings`, both forwarded into the URL hash. Only
 * the TypeScript excess-property check needs this; adhocQuestionHash spreads
 * every key at runtime.
 */
type AdhocQuestion = {
  name?: string;
  display?: string;
  visualization_settings?: Record<string, unknown>;
  dataset_query: {
    type: "native" | "query";
    database: number;
    native?: { query: string; "template-tags"?: Record<string, unknown> };
    query?: Record<string, unknown>;
  };
};

// The shared visitQuestionAdhoc / visitNativeQuestionAdhoc take the narrower
// permissions.AdhocQuestion; route through casts to satisfy the checker.
export type { AdhocQuestion };

// === findByDisplayValue ports (input/textarea/select — see PORTING.md) ===

function displayValueControls(scope: Scope): Locator {
  return (scope as Page).locator("input, textarea, select");
}

/** cy.findByDisplayValue(value).should("be.visible"). */
export async function expectDisplayValueVisible(scope: Scope, value: string) {
  await expect(async () => {
    const controls = displayValueControls(scope);
    const count = await controls.count();
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      if ((await control.inputValue()) === value && (await control.isVisible())) {
        return;
      }
    }
    throw new Error(`No visible form control with value "${value}"`);
  }).toPass();
}

/** cy.findByDisplayValue(value).should("not.exist"). */
export async function expectNoDisplayValue(scope: Scope, value: string) {
  await expect(async () => {
    const controls = displayValueControls(scope);
    const count = await controls.count();
    for (let i = 0; i < count; i++) {
      expect(await controls.nth(i).inputValue()).not.toBe(value);
    }
  }).toPass();
}

/** cy.findByDisplayValue(value): the (first) control with that current value. */
export async function getControlByDisplayValue(
  scope: Scope,
  value: string,
): Promise<Locator> {
  let result: Locator | undefined;
  await expect(async () => {
    const controls = displayValueControls(scope);
    const count = await controls.count();
    for (let i = 0; i < count; i++) {
      if ((await controls.nth(i).inputValue()) === value) {
        result = controls.nth(i);
        return;
      }
    }
    throw new Error(`No form control with value "${value}"`);
  }).toPass();
  return result as Locator;
}

// === ECharts tooltip ports (e2e-visual-tests-helpers.js) ===

/**
 * Port of H.echartsTooltip: ECharts may keep two DOM instances of the tooltip;
 * return the visible one.
 */
export function echartsTooltip(page: Page): Locator {
  return page.getByTestId("echarts-tooltip").filter({ visible: true });
}

/**
 * Port of H.cartesianChartCircle().eq(index).realHover(): hover the index-th
 * line/area data point. cartesianChartCircle asserts visibility first — hover's
 * actionability check waits for the same.
 */
export async function hoverLineDot(page: Page, index: number) {
  await cartesianChartCircles(page).nth(index).hover();
}

type TooltipRow = {
  name: string;
  color?: string;
  value?: string;
  secondaryValue?: string;
  index?: number;
};

/**
 * Port of H.assertEChartsTooltip ({ header, rows }). Only the header/rows
 * branches this spec uses are ported.
 */
export async function assertEChartsTooltip(
  page: Page,
  { header, rows }: { header?: string; rows?: TooltipRow[] },
) {
  const tooltip = echartsTooltip(page);

  if (header != null) {
    await expect(tooltip.getByTestId("echarts-tooltip-header")).toHaveText(header);
  }

  if (rows != null) {
    for (const { name, color, value, index } of rows) {
      const row = tooltip
        .getByText(name, { exact: true })
        .nth(index ?? 0)
        .locator("xpath=ancestor-or-self::tr[1]");
      if (color) {
        await expect(
          row.locator("td").first().locator("span"),
        ).toHaveClass(new RegExp(`marker-${color.replace("#", "")}`));
      }
      if (value) {
        await expect(row.getByText(value, { exact: true })).toBeVisible();
      }
    }
  }
}

/**
 * Port of H.resizeTableColumn(columnId, moveX): mousedown the column's resize
 * handle at clientX=0, mousemove to clientX=moveX, mouseup. Cypress's
 * cy.trigger fires synthetic events at absolute client coords; replicate with
 * a real-mouse drag from the handle to (moveX, handleY).
 */
export async function resizeTableColumn(
  page: Page,
  columnId: string,
  moveX: number,
  elementIndex = 0,
) {
  const handle = page.getByTestId(`resize-handle-${columnId}`).nth(elementIndex);
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`resize handle for "${columnId}" not visible`);
  }
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  // The Cypress helper fires a synthetic mousedown at clientX:0 then a mousemove
  // at clientX:moveX, so the resize component sees a +moveX delta. Reproduce the
  // delta (press at the handle, drag +moveX), not the absolute coordinate.
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + moveX, y, { steps: 5 });
  await page.waitForTimeout(100); // UI needs time to update (as in the original)
  await page.mouse.up();
}
