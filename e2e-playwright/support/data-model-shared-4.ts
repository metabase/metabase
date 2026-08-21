/**
 * Per-spec helpers for the data-model-shared-4 port
 * (e2e/test/scenarios/data-model/data-model-shared-4.cy.spec.ts).
 *
 * The shared surface lives in support/data-model.ts (shared-1),
 * support/data-model-shared-2.ts and support/data-model-shared-3.ts; all three
 * are imported READ-ONLY. This module only adds what none of them carries.
 * New module per PORTING rule 9 — shared modules are not edited.
 *
 * Port notes:
 * - The extra getters are transcribed from
 *   e2e/support/helpers/e2e-datamodel-helpers.ts (`clickDetailsTab` :339,
 *   `getTableSortOrderInput` :377, `getTableSyncOptionsButton` :381,
 *   `getTableActionsMenuButton` :385, `getTableSectionSortableField` :392,
 *   `getFieldMiniBarChartToggle` :509, `getFieldMultiplyByNumberInput` :513).
 *   testing-library's `findByLabelText` / `findByRole(name: string)` are EXACT,
 *   so every getter passes `{ exact: true }` — `getByLabel` defaults to a
 *   SUBSTRING match, which would silently loosen them. The two that upstream
 *   spells with a RegExp (`/Sync/`, `/Fields/`, `/Details/`) stay RegExps.
 * - `verifyToastAndUndo` is the spec's own local helper, not a shared one. It
 *   already reaches for `H.undoToastList()` rather than `H.undoToast()`, with
 *   an upstream comment explaining that two toasts coexist after an Undo.
 *   `undoToastList().should("contain.text", x)` on a multi-element subject is a
 *   chai-jquery CONCATENATION, so it is ported as a join over all toasts
 *   (`expectToastsContainText`, re-exported from shared-2) — `.first()` would
 *   silently STRENGTHEN it. The scoped `.filter(:contains).first()` action
 *   target is ported literally.
 * - `typeAppend` is the port of Cypress `.type()` on a non-empty input: Cypress
 *   focuses and types at the END of the existing value, where Playwright's
 *   `click()` would drop the caret wherever the pointer landed.
 * - `stubServerErrors` ports the "Error handling" beforeEach's seven/ten
 *   `cy.intercept(method, glob, { statusCode: 500 })` stubs. Cypress globs are
 *   minimatch: `*` does NOT cross a `/`, so `PUT /api/table/*` stubs
 *   `/api/table/123` but NOT `/api/table/123/fields/order` (which has its own
 *   stub). Ported as pathname REGEXPS with explicit anchors rather than
 *   Playwright globs, which match against the full URL including the query
 *   string and would miss `POST /api/dataset?...`.
 */
import type { Locator, Page, Route } from "@playwright/test";

import { TableSection as SharedTableSection } from "./data-model";
import type { Area } from "./data-model";
import { button, expectToastsContainText } from "./data-model-shared-2";
import { FieldSection as Shared3FieldSection } from "./data-model-shared-3";
import { expect } from "./fixtures";

/**
 * The TableSection getters this spec needs on top of the shared-1 ones.
 * Spread so call sites keep the single `TableSection.` namespace the Cypress
 * spec used.
 */
export const TableSection = {
  ...SharedTableSection,

  /** clickDetailsTab: `cy.findByRole("tab", { name: /Details/ }).click()` —
   * page-scoped upstream, not scoped to the table section. */
  clickDetailsTab: async (page: Page) => {
    await page.getByRole("tab", { name: /Details/ }).click();
  },

  /** getTableSortOrderInput: findByRole("radiogroup", { name: "Column order" }).
   * This is a Mantine SegmentedControl (FieldOrderPicker.tsx). */
  getSortOrderInput: (page: Page): Locator =>
    SharedTableSection.get(page).getByRole("radiogroup", {
      name: "Column order",
      exact: true,
    }),

  /** getTableSyncOptionsButton: findByRole("button", { name: /Sync/ }). */
  getSyncOptionsButton: (page: Page): Locator =>
    button(SharedTableSection.get(page), /Sync/),

  /** getTableActionsMenuButton: findByRole("button", { name: "More actions" }). */
  getActionsMenuButton: (page: Page): Locator =>
    button(SharedTableSection.get(page), "More actions"),

  /** getTableSectionSortableField — identical body to getTableSectionField. */
  getSortableField: (page: Page, name: string): Locator =>
    SharedTableSection.get(page).getByRole("listitem", { name, exact: true }),
};

/**
 * The FieldSection getters this spec needs on top of the shared-1/2/3 ones.
 */
export const FieldSection = {
  ...Shared3FieldSection,

  /** getFieldMiniBarChartToggle: findByLabelText("Show a mini bar chart"). */
  getMiniBarChartToggle: (page: Page): Locator =>
    Shared3FieldSection.get(page).getByLabel("Show a mini bar chart", {
      exact: true,
    }),

  /** getFieldMultiplyByNumberInput: findByLabelText("Multiply by a number"). */
  getMultiplyByNumberInput: (page: Page): Locator =>
    Shared3FieldSection.get(page).getByLabel("Multiply by a number", {
      exact: true,
    }),
};

/**
 * Upstream: `FieldSection.getMiniBarChartToggle().parent().click(...)`.
 * Same shape as shared-2's `clickCoercionToggle`: the Mantine Switch input is
 * visually hidden behind its track, so a real click needs `{ force: true }`
 * (PORTING rule 4). Cypress clicked the wrapper; a forced click on the input
 * runs the same activation behaviour.
 */
export async function clickMiniBarChartToggle(page: Page) {
  await FieldSection.getMiniBarChartToggle(page).click({ force: true });
}

/**
 * Port of the SegmentedControl option click in the field-order picker.
 *
 * PORTING ("Clicking things Mantine has hidden"): a SegmentedControl's radio
 * inputs are `sr-only` and offscreen. Upstream's `findByLabelText(name)` does
 * NOT resolve to the input here — `FieldOrderPicker/Label.tsx` puts the
 * `aria-label` on a visible `<Flex>` INSIDE the option's `<label>`, so this is
 * already the "click the visible label" form the rule prescribes.
 */
export function fieldOrderOption(page: Page, name: string): Locator {
  return TableSection.getSortOrderInput(page).locator(
    `[aria-label="${name}"]`,
  );
}

/**
 * `getSortOrderInput().findByDisplayValue(v).should("be.checked")` — the
 * SegmentedControl's hidden radio input carrying that value.
 */
export function fieldOrderRadio(page: Page, value: string): Locator {
  return TableSection.getSortOrderInput(page).locator(
    `input[value="${value}"]`,
  );
}

/**
 * Cypress `.type(text)` on a focused input appends at the END of the existing
 * value. Playwright's `click()` places the caret wherever the pointer landed,
 * so focus explicitly and drive the caret to the end first.
 */
export async function typeAppend(input: Locator, text: string) {
  await input.focus();
  await input.press("End");
  await input.pressSequentially(text);
}

/**
 * Port of the spec-local `verifyToastAndUndo`.
 *
 * Upstream (verbatim intent, comment included there): after clicking Undo,
 * Mantine STACKS a "Change undone" toast alongside the original rather than
 * mutating it, so `H.undoToast()` (singular `findByTestId`) would see two
 * elements. It therefore asserts against `H.undoToastList()` and scopes each
 * action with `.filter(':contains(text)').first()`.
 *
 * `undoToastList().should("contain.text", x)` on a multi-element subject is a
 * chai-jquery CONCATENATION — ported as a join, never `.first()`.
 *
 * Two deliberate, declared deviations (both matching shared-2's already-landed
 * `verifyAndCloseToast`):
 * - `icon("close").click({ force: true })` → `dispatchEvent("click")`. A
 *   Playwright force-click moves the real mouse and hits whatever is topmost,
 *   which at several call sites here is the mapping modal the toast sits behind.
 *   Cypress's `{force:true}` dispatches at the resolved element.
 * - a `toHaveCount(0)` settle after the close, so the next concatenated
 *   assertion is not racing the exit animation. This is a synchronisation, and
 *   it is a (small) strengthening over upstream, which asserts nothing here.
 */
export async function verifyToastAndUndo(page: Page, message: string) {
  const toast = (text: string) =>
    page.getByTestId("toast-undo").filter({ hasText: text }).first();

  await expectToastsContainText(page, message);
  await button(toast(message), "Undo").click();

  await expectToastsContainText(page, "Change undone");
  const undone = toast("Change undone");
  await undone.locator(".Icon-close").dispatchEvent("click");
  await expect(undone).toHaveCount(0);
}

/**
 * Re-exported so this spec uses the SAME toast helpers as shared-2 / shared-3.
 * Deliberately NOT the shared `data-model.ts:235` `verifyAndCloseToast`, which
 * is the measured strict-mode + force-click bug: `expect(undoToast(page))
 * .toContainText(msg)` explodes on two overlapping toasts, and this spec
 * produces overlapping toasts by construction (fourteen consecutive edits, each
 * toasting).
 */
export { expectToastsContainText, verifyAndCloseToast } from "./data-model-shared-2";

// === "Error handling" 500 stubs ==========================================

type PathMatcher = { method: string; pattern: RegExp };

/**
 * The `cy.intercept(method, glob, { statusCode: 500 })` set from the "Error
 * handling" beforeEach, as anchored pathname regexps. See the file header for
 * why globs are not used.
 */
function errorStubs(area: Area): PathMatcher[] {
  const common: PathMatcher[] = [
    { method: "POST", pattern: /^\/api\/dataset$/ },
    { method: "PUT", pattern: /^\/api\/field\/\d+$/ },
    { method: "PUT", pattern: /^\/api\/table\/\d+\/fields\/order$/ },
    { method: "POST", pattern: /^\/api\/field\/\d+\/values$/ },
    { method: "POST", pattern: /^\/api\/field\/\d+\/dimension$/ },
    { method: "PUT", pattern: /^\/api\/table\/\d+$/ },
  ];

  const perArea: PathMatcher[] =
    area === "admin"
      ? [
          { method: "POST", pattern: /^\/api\/table\/\d+\/sync_schema$/ },
          { method: "POST", pattern: /^\/api\/table\/\d+\/rescan_values$/ },
          { method: "POST", pattern: /^\/api\/table\/\d+\/discard_values$/ },
        ]
      : [
          { method: "POST", pattern: /^\/api\/data-studio\/table\/sync-schema$/ },
          {
            method: "POST",
            pattern: /^\/api\/data-studio\/table\/rescan-values$/,
          },
          {
            method: "POST",
            pattern: /^\/api\/data-studio\/table\/discard-values$/,
          },
        ];

  return [...common, ...perArea];
}

/** Install the 500 stubs. Must run before the navigation under test. */
export async function stubServerErrors(page: Page, area: Area) {
  const stubs = errorStubs(area);
  await page.route(
    (url) => stubs.some((stub) => stub.pattern.test(url.pathname)),
    async (route: Route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const matched = stubs.some(
        (stub) =>
          stub.method === request.method() && stub.pattern.test(pathname),
      );
      if (!matched) {
        return route.fallback();
      }
      // 🔴 EMPTY body, deliberately. `cy.intercept(url, { statusCode: 500 })`
      // sends no body at all, and the app's error surfaces render the server's
      // message when there is one. Fulfilling with `{"message":"Internal Server
      // Error"}` made the preview render exactly that string instead of the
      // generic "Something went wrong" the spec asserts — measured, run 1: both
      // "Error handling" cases failed on that last pair of assertions while
      // every toast assertion before them passed.
      await route.fulfill({ status: 500, body: "" });
    },
  );
}
