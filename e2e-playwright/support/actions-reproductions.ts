/**
 * Helpers for the actions-reproductions spec port
 * (e2e/test/scenarios/actions/actions-reproductions.cy.spec.js).
 *
 * Module name matches the target spec basename
 * (`support/actions-reproductions.ts` for `tests/actions-reproductions.spec.ts`)
 * — NO deviation from the convention.
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). Everything DB-facing is imported read-only from
 * ./actions-on-dashboards (the knex plumbing for the writable QA container
 * already lives there) and ./model-actions.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { createBasicActions } from "./model-actions";
import { questionInfoButton, sidesheet } from "./revisions";
import { WRITABLE_DB_ID } from "./schema-viewer";

/**
 * Port of the file-level `actionButtonContainer()`
 * (cy.findByTestId("action-button-full-container")).
 *
 * `findByTestId` is singular — it throws on multiple matches — so the
 * Playwright locator is deliberately left strict rather than `.first()`ed.
 */
export function actionButtonContainer(scope: Page | Locator): Locator {
  return scope.getByTestId("action-button-full-container");
}

/**
 * Port of the file-level `dashCard()`:
 *   cy.findAllByTestId("dashcard-container").last().should("have.text", "Click Me")
 *
 * The `should("have.text", …)` is part of the helper, so it runs on every call
 * — it is the gate that makes sure the *action* dashcard (not the Orders card)
 * is the one being measured. Kept, and awaited here.
 *
 * `toHaveText` normalizes whitespace, which is harmless for this subject (the
 * assertion is about which card, not about formatting).
 */
export async function dashCard(scope: Page | Locator): Promise<Locator> {
  const card = scope.getByTestId("dashcard-container").last();
  await expect(card).toHaveText("Click Me");
  return card;
}

/** `el.scrollHeight`, read inside the browser. */
export function scrollHeightOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.scrollHeight);
}

/**
 * Port of the file-level `setupBasicActionsInModel()`:
 *   H.questionInfoButton().click();
 *   H.sidesheet().findByText("Actions").click();
 *   cy.button(/Create basic actions/).click();
 *
 * The button click + the three POST /api/action waits are reused verbatim from
 * support/model-actions.ts `createBasicActions` (upstream's own helper has no
 * wait, but the three implicit actions must exist before the dashboard flow
 * picks "Update" out of the action list — Cypress's command queue supplied the
 * gap, Playwright's back-to-back calls do not).
 */
export async function setupBasicActionsInModel(page: Page) {
  await questionInfoButton(page).click();
  await sidesheet(page).getByText("Actions", { exact: true }).click();
  await createBasicActions(page);
}

/**
 * Port of H.getTable({ databaseId, name })
 * (e2e/support/helpers/e2e-qa-databases-helpers.js:323) — GET the database
 * metadata and return the table with the given name.
 *
 * DEVIATION, deliberate: the schema is pinned (`public` by default) where
 * upstream's helper matches on name alone. The writable QA container is shared
 * across slots and currently carries ~29 debris schemas (PORTING #85); an
 * unpinned lookup can win against a foreign same-named table. This only ever
 * narrows the match to the table the test actually created.
 */
export async function getTable(
  api: MetabaseApi,
  {
    databaseId = WRITABLE_DB_ID,
    name,
    schema = "public",
  }: { databaseId?: number; name: string; schema?: string },
): Promise<{ id: number; name: string; fields: { id: number; name: string }[] }> {
  const response = await api.get(`/api/database/${databaseId}/metadata`);
  const body = (await response.json()) as {
    tables: { id: number; name: string; schema: string; fields: { id: number; name: string }[] }[];
  };
  const table = body.tables?.find(
    (table) => table.name === name && table.schema === schema,
  );
  if (!table) {
    throw new TypeError(
      `Table "${schema}"."${name}" cannot be found on database ${databaseId}`,
    );
  }
  return table;
}

/**
 * Port of H.createModelFromTableName (e2e-qa-databases-helpers.js), returning
 * the model id. Same deviation as `getTable`: the source table is looked up
 * with the schema pinned.
 */
export async function createModelFromTable(
  api: MetabaseApi,
  {
    tableId,
    modelName = "Test Action Model",
    databaseId = WRITABLE_DB_ID,
  }: { tableId: number; modelName?: string; databaseId?: number },
): Promise<number> {
  const response = await api.post("/api/card", {
    name: modelName,
    type: "model",
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      query: { "source-table": tableId },
      database: databaseId,
    },
  });
  const { id } = (await response.json()) as { id: number };
  return id;
}

/**
 * Type into a text input the way Cypress's `.type()` does on a pre-filled
 * field: click to focus, move the caret to the END, then send real keystrokes.
 *
 * Playwright's `click()` drops the caret wherever the pointer landed, and
 * `fill()` REPLACES the value — both diverge from the upstream expectation
 * that " Baz" is appended to "Foo". `press("End")` is a no-op on an empty
 * input, so this is safe generally. (PORTING, wave 12: the caret-position
 * gotcha.)
 */
export async function appendToInput(input: Locator, text: string) {
  await input.click();
  await expect(input).toBeFocused();
  await input.press("End");
  await input.pressSequentially(text);
}
