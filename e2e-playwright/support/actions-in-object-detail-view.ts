/**
 * Helpers for the actions-in-object-detail-view spec port
 * (e2e/test/scenarios/actions/actions-in-object-detail-view.cy.spec.js).
 *
 * Module name matches the target spec basename
 * (`support/actions-in-object-detail-view.ts` for
 * `tests/actions-in-object-detail-view.spec.ts`) — NO deviation.
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). Everything DB-facing is IMPORTED from
 * ./actions-on-dashboards (knex plumbing for the writable QA container already
 * lives there) rather than re-copied.
 */
import type { Locator, Page, Response } from "@playwright/test";
import dayjs from "dayjs";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { WRITABLE_DB_ID, getTableId } from "./schema-viewer";
import { icon, popover } from "./ui";

/**
 * Port of H.createModelFromTableName (e2e-qa-databases-helpers.js).
 *
 * Deliberately NOT the copy in support/actions-on-dashboards.ts: that one
 * calls `getTableId` with the schema UNPINNED, which is only safe while
 * `scoreboard_actions` exists in exactly one schema of the shared container.
 * Sibling slots create and drop tables in `public` and elsewhere all day, so
 * the schema is pinned here. This is a narrowing of upstream's lookup, never a
 * widening.
 *
 * Returns the model id (upstream wraps it as `@modelId` and reads it back).
 */
export async function createModelFromTableName(
  api: MetabaseApi,
  {
    tableName,
    modelName = "Test Action Model",
    databaseId = WRITABLE_DB_ID,
    schema = "public",
  }: {
    tableName: string;
    modelName?: string;
    databaseId?: number;
    schema?: string;
  },
): Promise<number> {
  const tableId = await getTableId(api, { databaseId, name: tableName, schema });
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

// === intercept-alias predicates (PORTING rule 2) ===

/** cy.intercept("GET", "/api/action?model-id=*") — never awaited upstream. */
export const isGetModelActions = (response: Response) => {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname === "/api/action" &&
    url.searchParams.has("model-id")
  );
};

/** cy.intercept("POST", "/api/action/&ast;/execute"). */
export const isExecuteAction = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/action\/[^/]+\/execute$/.test(new URL(response.url()).pathname);

/** cy.intercept("GET", "/api/action/&ast;/execute?parameters=*"). */
export const isPrefetchValues = (response: Response) => {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    /^\/api\/action\/[^/]+\/execute$/.test(url.pathname) &&
    url.searchParams.has("parameters")
  );
};

// === cy.wait("@alias") queue semantics ===

type ResponseQueue = { responses: Response[]; consumed: number };

const aliasQueues = new WeakMap<Page, Map<string, ResponseQueue>>();

/**
 * Port of `cy.intercept(...).as(alias)`.
 *
 * `cy.wait("@alias")` pops the next UNCONSUMED response from a queue that
 * includes responses which ALREADY arrived; `page.waitForResponse` only ever
 * sees the future. That difference is load-bearing here: this spec opens the
 * update modal three times and waits on `@prefetchValues` three times, and the
 * form's own post-submit `prefetchValues()` fires a FOURTH, un-awaited request.
 * A naive waitForResponse pairing would either deadlock (RTK-Query serves the
 * re-open from cache) or silently consume the wrong response. The queue
 * reproduces Cypress exactly. See support/model-actions.ts for the same shape
 * (measured there: two tests burned 30s each before it went in).
 *
 * Install once per test, BEFORE anything can fire, so no response is missed.
 */
export function recordAlias(
  page: Page,
  alias: string,
  predicate: (response: Response) => boolean,
) {
  let queues = aliasQueues.get(page);
  if (!queues) {
    queues = new Map();
    aliasQueues.set(page, queues);
  }
  const queue: ResponseQueue = { responses: [], consumed: 0 };
  queues.set(alias, queue);
  page.on("response", (response) => {
    if (predicate(response)) {
      queue.responses.push(response);
    }
  });
}

/** Port of `cy.wait("@alias")` — pops the next unconsumed response. */
export async function waitForAlias(
  page: Page,
  alias: string,
): Promise<Response> {
  const queue = aliasQueues.get(page)?.get(alias);
  if (!queue) {
    throw new Error(`recordAlias(page, "${alias}", …) was never installed`);
  }
  await expect
    .poll(() => queue.responses.length, { timeout: 30_000 })
    .toBeGreaterThan(queue.consumed);
  return queue.responses[queue.consumed++];
}

// === spec-local UI helpers (ports of the file-level Cypress functions) ===

/** cy.findByTestId("action-form"). */
export function actionForm(scope: Page | Locator): Locator {
  return scope.getByTestId("action-form");
}

/** cy.findByTestId("object-detail"). */
export function objectDetailModal(scope: Page | Locator): Locator {
  return scope.getByTestId("object-detail");
}

/** cy.findByTestId("action-execute-modal"). */
export function actionExecuteModal(scope: Page | Locator): Locator {
  return scope.getByTestId("action-execute-modal");
}

/** cy.findByTestId("delete-object-modal"). */
export function deleteObjectModal(scope: Page | Locator): Locator {
  return scope.getByTestId("delete-object-modal");
}

/** cy.findByTestId("actions-menu"). */
export function actionsMenu(scope: Page | Locator): Locator {
  return scope.getByTestId("actions-menu");
}

/** Port of H.tableInteractive(): cy.findByTestId("table-root"). */
export function tableInteractive(page: Page): Locator {
  return page.getByTestId("table-root");
}

/** Port of H.undoToastList(): cy.findAllByTestId("toast-undo"). */
export function undoToastList(page: Page): Locator {
  return page.getByTestId("toast-undo");
}

/** Port of the spec-local openUpdateObjectModal. */
export async function openUpdateObjectModal(page: Page) {
  await actionsMenu(page).click();
  const update = popover(page).getByText("Update", { exact: true });
  await expect(update).toBeVisible();
  await update.click();
}

/** Port of the spec-local openDeleteObjectModal. */
export async function openDeleteObjectModal(page: Page) {
  await actionsMenu(page).click();
  const remove = popover(page).getByText("Delete", { exact: true });
  await expect(remove).toBeVisible();
  await remove.click();
}

/**
 * Port of the spec-local assertActionsDropdownExists.
 * `should("exist")` on a findByTestId is "exactly one" (findBy throws on
 * multiple), hence toHaveCount(1) rather than a bare toBeVisible().
 */
export async function assertActionsDropdownExists(scope: Page | Locator) {
  await expect(actionsMenu(scope)).toHaveCount(1);
}

/** Port of the spec-local assertActionsDropdownNotExists. */
export async function assertActionsDropdownNotExists(scope: Page | Locator) {
  await expect(actionsMenu(scope)).toHaveCount(0);
}

/**
 * Port of the spec-local assertInputValue.
 *
 * Upstream: `should("have.value", value || "")` where `value` comes straight
 * out of the prefetch JSON, i.e. it is a NUMBER for `id`/`score`. The DOM
 * always holds a string, so the comparison is stringified here.
 *
 * The `value || ""` fallback is ported VERBATIM including its latent bug: a
 * score of literal 0 would collapse to "" and the assertion would then demand
 * an empty input. Rows 11/12 (the only rows this spec prefills from) have
 * scores 70/80, so the branch is never taken — recorded, not "fixed".
 */
export async function assertInputValue(
  scope: Locator,
  labelText: string,
  value: unknown,
) {
  const expectedValue = String(value || "");
  await expect(scope.getByLabel(labelText, { exact: true })).toHaveValue(
    expectedValue,
  );
}

/**
 * Port of the spec-local assertDateInputValue:
 *   dayjs(value).format().replace(/-\d\d:\d\d$/, "")
 * i.e. an ISO-8601 local timestamp with the (negative) UTC offset lopped off.
 * The run sets TZ=US/Pacific, so the offset is always negative and the regex
 * always bites — same as CI.
 */
export async function assertDateInputValue(
  scope: Locator,
  labelText: string,
  value: unknown,
) {
  const expectedValue = dayjs(value as string)
    .format()
    .replace(/-\d\d:\d\d$/, "");
  await expect(scope.getByLabel(labelText, { exact: true })).toHaveValue(
    expectedValue,
  );
}

type ScoreRow = {
  id: unknown;
  team_name: unknown;
  score: unknown;
  status: unknown;
  created_at: unknown;
  updated_at: unknown;
};

/** Port of the spec-local assertScoreFormPrefilled. */
export async function assertScoreFormPrefilled(
  form: Locator,
  object: ScoreRow,
) {
  await assertInputValue(form, "ID", object.id);
  await assertInputValue(form, "Team Name", object.team_name);
  await assertInputValue(form, "Score", object.score);
  await assertInputValue(form, "Status", object.status);
  await assertDateInputValue(form, "Created At", object.created_at);
  await assertDateInputValue(form, "Updated At", object.updated_at);
}

/**
 * Port of the spec-local assertSuccessfullUpdateToast /
 * assertSuccessfullDeleteToast.
 *
 * Upstream takes `.last()` of the toast list, so the strict-mode hazard that
 * bites bare toast locators in Playwright (UndoListing.tsx:203 —
 * `"Cypress" in window ? MockGroup : TransitionGroup`, so exit transitions run
 * HERE but not under Cypress, and a dismissed toast lingers) does not apply:
 * `.last()` is the newest toast in either engine.
 *
 * `should("contain.text", …)` on a single-element subject is plain substring
 * containment — `toContainText` is the faithful port.
 */
export async function assertToast(page: Page, text: string) {
  const toast = undoToastList(page).last();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute("color", "feedback-positive");
  await expect(toast).toContainText(text);
}

/** Port of `objectDetailModal().icon("close").click()`. */
export async function closeObjectDetailModal(page: Page) {
  await icon(objectDetailModal(page), "close").click();
}
