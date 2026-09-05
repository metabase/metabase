/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-1.cy.spec.js.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9). Everything else the port needs is imported read-only
 * from the existing shared modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import { adhocQuestionHash } from "./native-editor";
import { popover } from "./ui";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** POST /api/dataset — the "@dataset" alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/card — the "@card" alias (issue 17910). */
export function waitForCreateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/** PUT /api/card/:id — the description edit in issue 17910. */
export function waitForUpdateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/card/:id/query — the "@cardQuery" alias (issue 19341). */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

/**
 * POST /api/dashboard/:dashboardId/dashcard/*\/card/:cardId/query — the
 * "@cardQuery" alias of issue 17514 scenario 1.
 */
export function waitForDashcardQuery(
  page: Page,
  dashboardId: number,
  cardId: number,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new RegExp(
        `^/api/dashboard/${dashboardId}/dashcard/\\d+/card/${cardId}/query$`,
      ).test(new URL(response.url()).pathname),
  );
}

/** GET /api/search — gate for the entity-picker search box (issue 19341). */
export function waitForSearch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search",
  );
}

/** PUT /api/table/:id — the "Hide table" toggle (issue 19742). */
export function waitForUpdateTable(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/table\/?\d*$/.test(new URL(response.url()).pathname),
  );
}

// === custom expression editor ===

const EXPRESSION_EDITOR_TESTID = "custom-expression-query-editor";

function customExpressionContent(page: Page): Locator {
  return page.getByTestId(EXPRESSION_EDITOR_TESTID).locator(".cm-content");
}

/**
 * Port of H.CustomExpressionEditor.focus().
 *
 * Upstream is `get().click("right", { force: true })` and the `force` is
 * LOAD-BEARING — the editor's own portalled overlays sit on top of
 * `.cm-content`, so a REAL click (which is what the shared
 * `custom-column-3.focusCustomExpressionEditor` does) can burn the whole
 * action timeout on "subtree intercepts pointer events". Cypress's
 * `{ force: true }` dispatches at the resolved element, so `dispatchEvent`
 * is the faithful equivalent (PORTING: `click({force:true})` is NOT the port
 * of Cypress's `{force:true}`).
 *
 * The upstream click lands on the RIGHT edge so the caret ends up at the end
 * of the line; a dispatched click carries no coordinates, so `End` is pressed
 * explicitly to reproduce that.
 */
export async function focusCustomExpressionEditorForced(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  const content = customExpressionContent(page);
  await expect(content).toBeVisible();
  await content.dispatchEvent("click");
  await expect(
    page.getByTestId(EXPRESSION_EDITOR_TESTID).locator(".cm-editor"),
  ).toHaveClass(/cm-focused/);
  await page.keyboard.press("End");
}

/** Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
export async function clearCustomExpressionEditorForced(page: Page) {
  await focusCustomExpressionEditorForced(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
}

/**
 * Port of H.CustomExpressionEditor.type() for the plain-text formulas this
 * spec uses (no `{...}` escape sequences), with the forced focus above.
 * Same 10ms inter-key delay as the Cypress realType default.
 */
export async function typeCustomExpressionForced(
  page: Page,
  text: string,
  { focus = true }: { focus?: boolean } = {},
) {
  if (focus) {
    await focusCustomExpressionEditorForced(page);
  }
  await page.keyboard.type(text, { delay: 10 });
}

/** Port of H.CustomExpressionEditor.blur(). */
export async function blurCustomExpressionEditor(page: Page) {
  await customExpressionContent(page).blur();
}

/**
 * Port of H.enterCustomColumnDetails({ formula, format }) — the shared
 * notebook.ts version has no `format` option and uses the real-click focus.
 */
export async function enterCustomColumnDetailsForced(
  page: Page,
  {
    formula,
    name,
    blur = true,
    format = false,
  }: { formula: string; name?: string; blur?: boolean; format?: boolean },
) {
  await clearCustomExpressionEditorForced(page);
  await typeCustomExpressionForced(page, formula, { focus: false });

  if (blur) {
    await blurCustomExpressionEditor(page);
  }

  if (format) {
    const button = page.getByLabel("Auto-format", { exact: true });
    await expect(button).toBeVisible();
    await button.click();
  }

  if (name) {
    await typeExpressionName(page, name);
  }
}

/**
 * Port of `H.CustomExpressionEditor.nameInput().type(name)`. Cypress's
 * `.type()` CLICKS its subject first and then sends keystrokes to
 * `document.activeElement`, so port it as click → keyboard, not `fill()`.
 */
export async function typeExpressionName(page: Page, name: string) {
  const input = page.getByTestId("expression-name");
  await input.click();
  await page.keyboard.type(name);
}

// === popovers ===

/**
 * H.POPOVER_ELEMENT (e2e-ui-elements-helpers.js:4). Deliberately NOT the
 * shared `popover()` helper: `assertNoOpenPopover` uses the bare
 * `cy.get(H.POPOVER_ELEMENT)`, i.e. WITHOUT the `:visible` filter that
 * `H.popover()` applies.
 */
export const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

/**
 * Port of the spec-local assertNoOpenPopover.
 *
 * `toHaveCount(0)` retries and so is the faithful equivalent of Cypress's
 * `should("not.exist")` — but BOTH are satisfied by "nothing has rendered
 * yet", and a drill popover renders some way after the click that would open
 * it (PORTING measured a drill popover at +243ms in a comparable case). There
 * is no positive DOM signal for "the click was ignored", so this uses a
 * bounded settle well clear of that measurement before asserting absence.
 * Margin documented deliberately rather than left implicit.
 */
export async function assertNoOpenPopover(page: Page, settleMs = 1000) {
  await page.waitForTimeout(settleMs);
  await expect(page.locator(POPOVER_ELEMENT)).toHaveCount(0);
}

// === date filter (issue 17514-1) ===

/**
 * Port of setAdHocFilter (e2e-date-filter-helpers.js), `timeBucket` branch —
 * the shared `filters-repros.setAdHocFilter` only covers condition /
 * includeCurrent. Scoped to the open popover (the shared port makes the same
 * scoping choice); upstream's lookups are page-wide but there is exactly one
 * popover open at this point.
 */
export async function setAdHocFilterTimeBucket(
  page: Page,
  timeBucket: string,
  buttonLabel = "Add filter",
) {
  const dropdown = popover(page).first();
  await dropdown.getByText("Relative date range…", { exact: true }).click();
  // Upstream is click({ force: true }) — dispatch, not Playwright's force.
  await dropdown
    .getByText("Previous", { exact: true })
    .first()
    .dispatchEvent("click");

  const unit = page.getByRole("textbox", { name: "Unit", exact: true });
  await expect(unit).toHaveValue("days");
  await unit.click();

  // selectDropdown().contains(timeBucket) — case-sensitive substring, first.
  await popover(page)
    .getByRole("listbox")
    .getByText(new RegExp(escapeRegExp(timeBucket)))
    .first()
    .click();

  await page.getByRole("button", { name: buttonLabel, exact: true }).click();
}

// === opening a table in the notebook on a NON-sample database ===

/**
 * `H.openTable({ database, table, mode: "notebook" })` for a database other
 * than the H2 sample.
 *
 * The shared `ad-hoc-question.openTable` **drops its `database` option on the
 * notebook branch** — `joins.openTableNotebook` hardcodes `SAMPLE_DB_ID`
 * (support/joins.ts:44). That is harmless for every current caller (they all
 * open sample tables), but issue 15714 opens a QA-Postgres table: the notebook
 * loads against database 1 with a database-2 table id, the data step renders
 * empty, and the helper's own readiness gate times out with a fingerprint
 * ("data-step-cell not found") that points at the picker rather than the id
 * mismatch. Flagged for consolidation rather than edited in place, since
 * shared modules are off-limits to porting agents.
 */
export async function openTableNotebookInDatabase(
  page: Page,
  database: number,
  tableId: number,
) {
  const hash = adhocQuestionHash({
    dataset_query: {
      database,
      query: { "source-table": tableId },
      type: "query",
    },
  });
  await page.goto(`/question/notebook#${hash}`);
  await expect(
    page.getByTestId("step-data-0-0").getByTestId("data-step-cell"),
  ).toBeVisible();
}

// === collection-table row menu (issue 9027) ===

/**
 * Port of the spec-local openEllipsisMenuFor:
 * `cy.findByText(item).closest("tr").find(".Icon-ellipsis").click({force:true})`.
 *
 * The `has:` sub-locator is built from `page`, never from the row locator —
 * a Locator-scoped `has` gets re-anchored to the outer scope and never
 * resolves (PORTING). The click is dispatched rather than force-clicked: the
 * icon is hover-revealed, and Cypress's `{ force: true }` dispatches at the
 * resolved element instead of moving a real mouse.
 */
export async function openEllipsisMenuFor(page: Page, item: string) {
  const row = page
    .locator("tr")
    .filter({ has: page.getByText(item, { exact: true }) });
  await expect(row).toHaveCount(1);
  await row.locator(".Icon-ellipsis").first().dispatchEvent("click");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
