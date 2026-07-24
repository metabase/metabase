/**
 * Helpers for filter.spec.ts — the few pieces of the query-builder filter UI
 * that the shared support modules don't already cover. Lives in its own file so
 * the shared modules stay untouched; every notebook / custom-expression /
 * factory helper it needs is imported read-only from notebook.ts, joins.ts,
 * ad-hoc-question.ts, custom-column*.ts, cc-typing-suggestion.ts,
 * viz-charts-repros.ts, ui.ts and text.ts.
 */
import type { Locator, Page } from "@playwright/test";

import { typeExpression } from "./cc-typing-suggestion";
import { expect } from "./fixtures";
import { cartesianChartCircleWithColor } from "./viz-charts-repros";

/**
 * Port of H.filter() simple-mode branch (initiateAction, e2e-bi-basics-helpers.js):
 * guard against the "Doing science" loading state, then click the QB header's
 * Filter action. (The notebook-mode branch is joins.ts filterNotebook.)
 */
export async function filterSimple(page: Page) {
  await expect(page.getByText(/^Doing science/)).toHaveCount(0);
  await page
    .getByTestId("qb-header-action-panel")
    .getByText("Filter", { exact: true })
    .click();
}

/**
 * Port of H.CustomExpressionEditor.type() for formulas containing the `→`
 * foreign-key arrow. The upstream codeMirror helper types the literal `->`,
 * which the editor's input rule expands into `→` (realType cannot emit `→`
 * directly); mirror that substitution, then delegate to the escape-aware
 * typeExpression (which drives the CodeMirror editor with real keystrokes).
 */
export async function customExpressionType(
  page: Page,
  text: string,
  opts?: { focus?: boolean; delay?: number },
) {
  await typeExpression(page, text.replaceAll("→", "->"), opts);
}

/**
 * Port of the isVisibleInPopover custom command (metabase#14307): the element
 * (accounting for its own padding/border) must sit fully within the vertical
 * bounds of its enclosing popover — i.e. reachable without scrolling the
 * popover.
 */
export async function expectVisibleInPopover(button: Locator) {
  await expect(button).toBeVisible();
  const box = await button.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const px = (p: string) => parseFloat(style.getPropertyValue(p)) || 0;
    const rect = el.getBoundingClientRect();
    const popover = el.closest(".popover, [data-element-id=mantine-popover]");
    if (!popover) {
      return null;
    }
    const pr = popover.getBoundingClientRect();
    return {
      top: rect.top + px("padding-top") + px("border-top"),
      bottom: rect.bottom - px("padding-bottom") - px("border-bottom"),
      popTop: pr.top,
      popBottom: pr.bottom,
    };
  });
  expect(box, "element is not inside a popover").not.toBeNull();
  const { top, bottom, popTop, popBottom } = box!;
  expect(top).toBeGreaterThan(popTop);
  expect(bottom).toBeGreaterThan(popTop);
  expect(top).toBeLessThanOrEqual(popBottom);
  expect(bottom).toBeLessThanOrEqual(popBottom);
}

/**
 * Port of `H.cartesianChartCircleWithColors(colors)`: each color's data-point
 * markers must be visible (the Cypress helper appends `.should("be.visible")`
 * per color; multiple points share a stroke color, so assert the first).
 */
export async function expectChartCirclesWithColors(page: Page, colors: string[]) {
  for (const color of colors) {
    await expect(cartesianChartCircleWithColor(page, color).first()).toBeVisible();
  }
}

/** Port of `cy.focused().should("have.attr", "role", role)`. */
export async function expectFocusedRole(page: Page, role: string) {
  await expect(page.locator(":focus")).toHaveAttribute("role", role);
}
