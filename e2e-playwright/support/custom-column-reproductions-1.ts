/**
 * Helpers for custom-column-reproductions-1.spec.ts.
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). The CodeMirror pieces are reused read-only from
 * custom-column-3.ts / cc-typing-suggestion.ts; only what those don't cover
 * lives here.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import {
  clearCustomExpressionEditor,
  focusCustomExpressionEditor,
} from "./custom-column-3";
import { expect } from "./fixtures";
import { writableDbConfig } from "./writable-db";

/* ------------------------------------------------------------------ *
 * Writable QA database (issue 27745)
 * ------------------------------------------------------------------ */

// Connection facts live in support/writable-db.ts, which resolves this
// worker's own writable database (writable_db_w<slot>) when per-worker
// isolation is on.

type KnexClient = {
  schema: {
    dropTableIfExists(name: string): Promise<unknown>;
    createTable(name: string, cb: (table: unknown) => void): Promise<unknown>;
  };
  (tableName: string): {
    insert(rows: Record<string, unknown>[]): Promise<unknown>;
  };
  destroy(): Promise<void>;
};

/**
 * Port of H.resetTestTable({ type: "postgres", table: "colors27745" })
 * (cy.task("resetTable") → e2e/support/test_tables.js colors27745). The shared
 * actions-on-dashboards.ts resetTestTable only knows two other tables, and it
 * is not ours to edit — same knex schema-builder calls, same three rows.
 *
 * `knex`/`pg` are not dependencies of this package; they resolve from the
 * repo-root node_modules (the drivers Cypress itself uses), so the require is
 * lazy — this module must still load when the QA-DB gate is off.
 */
export async function resetColorsTable() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  const client = Knex(writableDbConfig("postgres"));
  const tableName = "colors27745";
  try {
    await client.schema.dropTableIfExists(tableName);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await client.schema.createTable(tableName, (table: any) => {
      table.increments("id").primary();
      table.string("name").unique().notNullable();
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await client(tableName).insert([
      { name: "red" },
      { name: "green" },
      { name: "blue" },
    ]);
  } finally {
    await client.destroy();
  }
}

/**
 * Upstream fires `POST /api/database/:id/sync_schema` and never waits for it —
 * Cypress's command queue plus the mini-picker's own `cy.wait("@search")`
 * retry happened to cover the window. Playwright fires the next action
 * immediately, so gate on the thing the test actually reads: the table being
 * *searchable*. (Not `resyncDatabase({dbId})` — that returns as soon as the DB
 * has any synced table and would gate on nothing.)
 */
export async function syncWritableDbAndWaitForTable(
  api: MetabaseApi,
  dbId: number,
  tableName: string,
) {
  await api.post(`/api/database/${dbId}/sync_schema`);
  await expect
    .poll(
      async () => {
        const response = await api.get(
          `/api/search?q=${tableName}&models=table&limit=10`,
          { failOnStatusCode: false },
        );
        if (!response.ok()) {
          return 0;
        }
        const body = (await response.json()) as {
          data?: { name?: string }[];
        };
        return (body.data ?? []).filter((item) =>
          (item.name ?? "").toLowerCase().includes(tableName.toLowerCase()),
        ).length;
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toBeGreaterThan(0);
}

/* ------------------------------------------------------------------ *
 * Expression editor extras
 * ------------------------------------------------------------------ */

/**
 * Port of H.CustomExpressionEditor.paste(content): the upstream builds a
 * DataTransfer and dispatches a synthetic ClipboardEvent at the editor's
 * `[role=textbox]` (a real clipboard paste is not drivable here either).
 * Replayed verbatim inside the page.
 */
export async function pasteIntoExpressionEditor(page: Page, content: string) {
  await page
    .getByTestId("custom-expression-query-editor")
    .locator("[role='textbox']")
    .evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      );
    }, content);
}

/**
 * Port of H.CustomExpressionEditor.type() covering the full escape-sequence
 * set this spec uses ({end}/{home}/{leftarrow}/{rightarrow}/{uparrow}/
 * {downarrow}/{enter}/{backspace}/{tab}/{selectall}/{clear}). The existing
 * escape-aware copies (cc-typing-suggestion.typeExpression,
 * custom-column-3.customExpressionEditorType) handle only subsets and are not
 * ours to edit.
 *
 * Repeated key presses are paced with a real ~25ms GAP between presses, not
 * `press(key, { delay })` — that option is the keydown→keyup hold, so presses
 * still land back-to-back. page.keyboard has none of the Cypress per-command
 * queue latency and CodeMirror coalesces bursts: measured, 5 ArrowDowns in the
 * completions popup advanced the selection by 2.
 */
export async function typeInEditor(
  page: Page,
  text: string,
  { focus = true, delay = 10 }: { focus?: boolean; delay?: number } = {},
) {
  if (focus) {
    await focusCustomExpressionEditor(page);
  }

  const parts = text.split(/(\{[^}]+\})/);
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    switch (part.toLowerCase()) {
      case "{clear}":
        await clearCustomExpressionEditor(page);
        break;
      case "{selectall}":
        await focusCustomExpressionEditor(page);
        await page.keyboard.press("ControlOrMeta+A");
        break;
      case "{leftarrow}":
        await pressPaced(page, "ArrowLeft");
        break;
      case "{rightarrow}":
        await pressPaced(page, "ArrowRight");
        break;
      case "{uparrow}":
        await pressPaced(page, "ArrowUp");
        break;
      case "{downarrow}":
        await pressPaced(page, "ArrowDown");
        break;
      case "{enter}":
        await pressPaced(page, "Enter");
        break;
      case "{home}":
      case "{movetostart}":
        await pressPaced(page, "Home");
        break;
      case "{end}":
      case "{movetoend}":
        await pressPaced(page, "End");
        break;
      case "{backspace}":
        await pressPaced(page, "Backspace");
        break;
      case "{tab}":
        await pressPaced(page, "Tab");
        break;
      default:
        await page.keyboard.type(part, { delay });
    }
  }
}

/** One key press with a real gap after it (see typeInEditor). */
async function pressPaced(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(25);
}

/**
 * Port of H.enterCustomColumnDetails — escape-aware (see typeInEditor) and
 * with the same clear → type → blur → name ordering as upstream.
 */
export async function enterCustomColumnDetails(
  page: Page,
  {
    formula,
    name,
    blur = true,
  }: { formula: string; name?: string; blur?: boolean },
) {
  await clearCustomExpressionEditor(page);
  await typeInEditor(page, formula, { focus: false });

  if (blur) {
    await blurExpressionEditor(page);
  }

  if (name) {
    const nameInput = page.getByTestId("expression-name");
    await nameInput.fill(name);
    await nameInput.blur();
  }
}

/**
 * Port of H.CustomExpressionEditor.blur(): the upstream clicks the
 * expression-editor widget's bottom-right corner (its footer, below the
 * contenteditable) so the editor loses focus without closing the popover.
 */
export async function blurExpressionEditor(page: Page) {
  const widget = page.getByTestId("expression-editor");
  const box = await widget.boundingBox();
  if (!box) {
    throw new Error("expression-editor widget has no bounding box");
  }
  await widget.click({
    position: { x: box.width - 3, y: box.height - 3 },
    force: true,
  });
}

/** The element `cy.focused()` would resolve to. */
export function focusedElement(page: Page): Locator {
  return page.locator(":focus");
}

/* ------------------------------------------------------------------ *
 * Notebook extras
 * ------------------------------------------------------------------ */

/**
 * Port of the spec-local previewCustomColumnNotebookStep (issue 21135): click
 * the expression step's play icon and wait for the preview dataset. The
 * response wait is registered before the click (PORTING rule 2).
 */
export async function previewExpressionStep(page: Page) {
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page.getByTestId("step-expression-0-0").locator(".Icon-play").click();
  await dataset;
}

/**
 * Port of the spec-local unselectColumn (issue 20229):
 * `cy.findByText(column).siblings().find(".Icon-check").click({force:true})`.
 * A real force-click would move the mouse and hit whatever is topmost; the
 * faithful equivalent of Cypress's dispatch-at-the-resolved-element is
 * dispatchEvent (PORTING: force-click is not `{force:true}`).
 */
export async function unselectFieldsPickerColumn(
  scope: Locator,
  column: string,
) {
  // `.siblings().find(".Icon-check")` — the check icon lives in a sibling of
  // the label, so resolve it through the shared parent (the label element
  // itself contains no icon, so parent-scoped and sibling-scoped agree).
  await scope
    .getByText(column, { exact: true })
    .locator("xpath=..")
    .locator(".Icon-check")
    .first()
    .dispatchEvent("click");
}

/**
 * Port of H.CustomExpressionEditor.acceptCompletion(key): assert the popup is
 * up, then (after upstream's 300ms anti-flake wait, which Cypress's per-command
 * queue latency supplies for free) press the key.
 *
 * Measured, not assumed: without the 300ms, four tests here pressed Enter with
 * the popup visible and CodeMirror inserted a NEWLINE instead of accepting —
 * `[Tot` + Enter yielded "[Tot\n  ]" rather than "[Total] ".
 */
export async function acceptCompletionWith(
  page: Page,
  key: "Enter" | "Tab" = "Enter",
) {
  await expect(
    page.getByTestId("custom-expression-editor-suggestions"),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press(key);
}

/** The `[role=option][aria-selected=true]` row of the completions popup. */
export function selectedCompletion(page: Page): Locator {
  return page
    .getByTestId("custom-expression-editor-suggestions")
    .locator("[role='option'][aria-selected='true']");
}
