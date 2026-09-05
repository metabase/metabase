/**
 * Helpers for the SmartScalar trend-chart spec port
 * (e2e/test/scenarios/visualizations-tabular/smartscalar-trend.cy.spec.js).
 *
 * Only genuinely new helpers live here. Generic UI helpers reused from the
 * shared modules are imported by the spec directly (popover / icon / modal from
 * ui.ts, selectDropdown from dashboard.ts, etc.).
 *
 * `menu` and `button` duplicate one-liners that already exist elsewhere
 * (schema-viewer.ts, the Cypress `cy.button` command); they are defined here to
 * keep the port self-contained per the porting brief — fold into ui.ts at the
 * next consolidation pass.
 */
import type { Locator, Page } from "@playwright/test";

/** Port of H.menu() (e2e-ui-elements-helpers.js): the open Mantine menu. */
export function menu(page: Page): Locator {
  return page.getByRole("menu");
}

/**
 * The comparison label ("vs. previous month:", "vs. Mar:", …) is a MIXED
 * content node: PreviousValueComparison's DetailCandidate renders
 * jt`${desc}: ${<span>{value}</span>}`, so the heading's full text is
 * "vs. previous month: 45,683.68". testing-library's `findByText(label)` matched
 * the heading by its own text nodes (label only); Playwright's exact getByText
 * compares the full element text and misses. Match the label as a case-sensitive
 * substring instead (the documented fix for mixed-content nodes). The value
 * itself is in its own `<span>`, so those stay exact getByText.
 */
export function comparisonLabel(scope: Page | Locator, label: string): Locator {
  return scope.getByText(new RegExp(escapeRegExp(label)));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the `cy.button(name)` command (e2e/support/commands/ui/button.ts):
 * findByRole("button", { name }) — testing-library string names are exact.
 */
export function button(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

/**
 * The Cypress spec's `cy.get("input").click().type(text)` inside the periods-ago
 * menu. The Mantine NumberInput (allowDecimal=false) selects its contents on
 * click, so each `type` REPLACES the value and PeriodsAgoMenuOption's
 * clamp/decimal-strip runs per keystroke — typing "1.2" drops the dot to give
 * "12". `fill` (one input event) parses "1.2" as "1" and breaks that case, so we
 * click (app's select-on-click + stopPropagation), select, then type char by char.
 */
export async function typeClampedValue(input: Locator, text: string) {
  await input.click();
  await input.selectText();
  await input.pressSequentially(text);
}

/**
 * Resolve a CSS color string (e.g. an `hsla(...)` theme value) to the computed
 * `rgb(...)` form Playwright's toHaveCSS("color", ...) compares against. Doing
 * the conversion in the page guarantees the exact same rounding Chromium uses
 * for the element under test — this is the dependency-free stand-in for the
 * Cypress original's `Color(colors.error).rgb().string()`.
 */
export async function cssColorToRgb(page: Page, color: string): Promise<string> {
  return page.evaluate((value) => {
    const el = document.createElement("span");
    el.style.color = value;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    return rgb;
  }, color);
}

/**
 * `colors.error` / `colors.success` from the light theme
 * (frontend/src/metabase/ui/colors/constants/themes/light.ts →
 * baseColors.lobster[50] / palm[50]). Inlined because this package has no path
 * alias into frontend/src (same reasoning as support/charts.ts' TREND_LINE_DASH).
 */
export const ERROR_COLOR = "hsla(358, 71%, 62%, 1)";
export const SUCCESS_COLOR = "hsla(89, 48%, 40%, 1)";
