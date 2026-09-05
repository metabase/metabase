/**
 * Helpers for the model-actions spec port
 * (e2e/test/scenarios/actions/model-actions.cy.spec.js).
 *
 * Module name matches the target spec basename (`support/model-actions.ts` for
 * `tests/model-actions.spec.ts`) — NO deviation from the convention.
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). Everything DB-facing is re-exported from
 * ./actions-on-dashboards (the closest relative — knex plumbing for the
 * writable QA container already lives there; PORTING says import rather than
 * write a fifth copy).
 */
import type { Locator, Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "./api";
import { createAction, queryWritableDB } from "./actions-on-dashboards";
import type { WritebackDialect } from "./actions-on-dashboards";
import { expect } from "./fixtures";
import { focusNativeEditor, nativeEditor } from "./native-editor";
import { icon, modal, popover } from "./ui";

/**
 * Port of IMPERSONATED_USER_ID (e2e/support/cypress_sample_instance_data.js) —
 * derived by email exactly like the Cypress export, so the value tracks the
 * `default` snapshot rather than being hardcoded.
 */
export const IMPERSONATED_USER_ID: number = (() => {
  const user = (
    SAMPLE_INSTANCE_DATA.users as { id: number; email: string }[]
  ).find((user) => user.email === "impersonated@metabase.test");
  if (!user) {
    throw new Error(
      'User "impersonated@metabase.test" not found in cypress_sample_instance_data',
    );
  }
  return user.id;
})();

/**
 * Mirrors USER_GROUPS (e2e/support/cypress_data.js:42) — fixed ids baked into
 * the `default` snapshot. Transcribed in full because the partial mirror in
 * click-behavior.ts carries only COLLECTION_GROUP, and guessing the rest is
 * how this port first shipped a silently-wrong impersonation test (ids 4/5
 * instead of 5/6 — group 4 is MAGIC_USER_GROUPS.DATA_ANALYSTS_GROUP).
 */
export const USER_GROUPS = {
  ALL_USERS_GROUP: 1,
  ADMIN_GROUP: 2,
  COLLECTION_GROUP: 5,
  DATA_GROUP: 6,
  READONLY_GROUP: 7,
  NOSQL_GROUP: 8,
} as const;

/** Port of getCreatePostgresRoleIfNotExistSql (e2e/support/test_roles.js). */
export const getCreatePostgresRoleIfNotExistSql = (
  roleName: string,
  grantSql: string,
) => `
    DO
    $do$
    BEGIN
      IF NOT EXISTS ( SELECT FROM pg_roles
                      WHERE  rolname = '${roleName}') THEN

        CREATE ROLE ${roleName};
        ${grantSql}

      END IF;
    END
    $do$;
  `;

/**
 * Port of cy.updatePermissionsGraph (e2e/support/commands/permissions/
 * updatePermissions.ts). The existing ports (dashboard-repros.ts,
 * pivot-tables.ts) drop the second `impersonations` argument, which the
 * impersonation test here needs — hence a local copy rather than an edit to a
 * shared module.
 */
export async function updatePermissionsGraph(
  api: MetabaseApi,
  groupsPermissionsObject: Record<string, unknown>,
  impersonations?: Record<string, unknown>[],
) {
  const response = await api.get("/api/permissions/graph");
  const { groups, revision } = (await response.json()) as {
    groups: Record<string, unknown>;
    revision: number;
  };
  await api.put("/api/permissions/graph", {
    groups: { ...groups, ...groupsPermissionsObject },
    revision,
    impersonations,
  });
}

/** Port of H.createImplicitActions (e2e-action-helpers.js). */
export async function createImplicitActions(
  api: MetabaseApi,
  { modelId }: { modelId: number },
) {
  for (const kind of ["create", "update", "delete"] as const) {
    await createAction(api, {
      kind: `row/${kind}`,
      name: kind.charAt(0).toUpperCase() + kind.slice(1),
      type: "implicit",
      model_id: modelId,
    });
  }
}

// === intercept-alias predicates (PORTING rule 2) ===

/** cy.intercept("GET", "/api/card/*") — the Cypress glob stops at "/". */
export const isGetModel = (response: Response) =>
  response.request().method() === "GET" &&
  /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname);

/** cy.intercept("GET", "/api/action/*"). */
export const isGetAction = (response: Response) =>
  response.request().method() === "GET" &&
  /^\/api\/action\/[^/]+$/.test(new URL(response.url()).pathname);

/** cy.intercept("PUT", "/api/action/*"). */
export const isUpdateAction = (response: Response) =>
  response.request().method() === "PUT" &&
  /^\/api\/action\/[^/]+$/.test(new URL(response.url()).pathname);

/** cy.intercept("POST", "/api/action"). */
export const isCreateAction = (response: Response) =>
  response.request().method() === "POST" &&
  new URL(response.url()).pathname === "/api/action";

/** cy.intercept("POST", "/api/action/:id/execute") (glob "/api/action/&ast;/execute"). */
export const isExecuteAction = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/action\/[^/]+\/execute$/.test(new URL(response.url()).pathname);

/** cy.intercept("POST", "/api/action/:id/public_link"). */
export const isEnableActionSharing = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/action\/[^/]+\/public_link$/.test(new URL(response.url()).pathname);

/** cy.intercept("DELETE", "/api/action/:id/public_link"). */
export const isDisableActionSharing = (response: Response) =>
  response.request().method() === "DELETE" &&
  /^\/api\/action\/[^/]+\/public_link$/.test(new URL(response.url()).pathname);

// === spec-local UI helpers (ports of the file-level Cypress functions) ===

/** cy.findByLabelText("Action list") — the <ul aria-label="Action list">. */
export function actionList(page: Page): Locator {
  return page.getByLabel("Action list", { exact: true });
}

/** cy.findByRole("listitem", { name }) — <li aria-label={action.name}>. */
export function actionListItem(page: Page, actionName: string): Locator {
  return page.getByRole("listitem", { name: actionName, exact: true });
}

/** Port of H.fillActionQuery — NativeEditor.type(query) (append at caret end). */
export async function fillActionQuery(page: Page, query: string) {
  await focusNativeEditor(page);
  await page.keyboard.type(query, { delay: 10 });
}

type ResponseQueue = { responses: Response[]; consumed: number };

const getActionQueues = new WeakMap<Page, ResponseQueue>();

/**
 * Port of `cy.intercept("GET", "/api/action/*").as("getAction")`.
 *
 * Cypress keeps a QUEUE of matched responses per alias, and `cy.wait("@x")`
 * pops the next UNCONSUMED one — including responses that already arrived.
 * `page.waitForResponse` only ever sees the future, which deadlocks here:
 * `openActionEditorFor` fires the GET, and the later run-modal open is served
 * from RTK-Query cache with no new request at all (PORTING: "waitForResponse
 * on an RTK-Query-cached endpoint hangs"). Measured: two tests burned 30s each
 * on exactly this before the queue model went in.
 *
 * Install once per test (in a beforeEach) so no response is missed.
 */
export function recordGetAction(page: Page) {
  const queue: ResponseQueue = { responses: [], consumed: 0 };
  getActionQueues.set(page, queue);
  page.on("response", (response) => {
    if (isGetAction(response)) {
      queue.responses.push(response);
    }
  });
}

/** Port of cy.wait("@getAction") — pops the next unconsumed response. */
export async function waitForGetAction(page: Page): Promise<Response> {
  const queue = getActionQueues.get(page);
  if (!queue) {
    throw new Error("recordGetAction(page) was never installed for this page");
  }
  await expect
    .poll(() => queue.responses.length, { timeout: 30_000 })
    .toBeGreaterThan(queue.consumed);
  return queue.responses[queue.consumed++];
}

/**
 * Port of the spec-local runActionFor: click the row's play icon, then
 * cy.wait("@getAction").
 */
export async function runActionFor(page: Page, actionName: string) {
  await icon(actionListItem(page, actionName), "play").click();
  await waitForGetAction(page);
}

/** Port of the spec-local openActionMenuFor. */
export async function openActionMenuFor(page: Page, actionName: string) {
  await icon(actionListItem(page, actionName), "ellipsis").click();
}

/** Port of the spec-local openActionEditorFor. */
export async function openActionEditorFor(
  page: Page,
  actionName: string,
  { isReadOnly = false }: { isReadOnly?: boolean } = {},
) {
  await openActionMenuFor(page, actionName);
  await popover(page)
    .getByText(isReadOnly ? "View" : "Edit", { exact: true })
    .click();
}

/**
 * Port of the spec-local assertQueryEditorDisabled.
 *
 * Upstream: click the editor, assert it did NOT take focus, assert
 * contenteditable="false", then type with `{ focus: false }` and assert the
 * text never landed. The `focus: false` branch of NativeEditor.type skips the
 * click-to-focus, so the keystrokes go to document.activeElement — the exact
 * behaviour page.keyboard.type has.
 */
export async function assertQueryEditorDisabled(page: Page) {
  const editor = nativeEditor(page);
  await editor.click();
  await expect(editor).not.toBeFocused();
  await expect(editor).toHaveAttribute("contenteditable", "false");

  await page.keyboard.type("QWERTY", { delay: 10 });
  await expect(page.getByText("QWERTY", { exact: true })).toHaveCount(0);
}

/**
 * Port of the spec-local createBasicActions.
 *
 * `cy.wait(["@createAction", "@createAction", "@createAction"])` becomes a
 * response COUNTER polled to >= 3 — three concurrent waitForResponse promises
 * on one predicate would all resolve on the first hit (PORTING, batches 8-11).
 */
export async function createBasicActions(page: Page) {
  let created = 0;
  const onResponse = (response: Response) => {
    if (isCreateAction(response)) {
      created += 1;
    }
  };
  page.on("response", onResponse);
  try {
    await page.getByRole("button", { name: /Create basic actions/i }).click();
    await expect.poll(() => created).toBeGreaterThanOrEqual(3);
  } finally {
    page.off("response", onResponse);
  }
}

/**
 * Port of the spec-local enableSharingFor. Returns the public URL rather than
 * aliasing it (Cypress wraps it as @<publicUrlAlias>).
 */
export async function enableSharingFor(
  page: Page,
  actionName: string,
): Promise<string> {
  await openActionEditorFor(page, actionName);

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Action settings" }).click();

  const makePublic = dialog.getByLabel("Make public", { exact: true });
  await expect(makePublic).not.toBeChecked();
  const sharingEnabled = page.waitForResponse(isEnableActionSharing);
  // Upstream clicks the checkbox's PARENT (the Mantine switch body); the
  // sr-only input itself is not the click target.
  await makePublic.locator("..").click();
  await sharingEnabled;

  const url = await dialog
    .getByLabel("Public action form URL", { exact: true })
    .inputValue();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  return url;
}

/** Port of the spec-local disableSharingFor. */
export async function disableSharingFor(page: Page, actionName: string) {
  await openActionEditorFor(page, actionName);

  const dialog = page.getByRole("dialog").first();
  await dialog.getByRole("button", { name: "Action settings" }).click();

  const makePublic = dialog.getByLabel("Make public", { exact: true });
  await expect(makePublic).toBeChecked();
  await makePublic.locator("..").click();

  const confirm = modal(page).nth(1);
  await expect(
    confirm.getByText("Disable this public link?", { exact: true }),
  ).toBeVisible();
  const sharingDisabled = page.waitForResponse(isDisableActionSharing);
  await confirm.getByRole("button", { name: "Yes" }).click();
  await sharingDisabled;

  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
}

/** Port of the spec-local verifyScoreValue. */
export async function verifyScoreValue(
  value: number,
  dialect: WritebackDialect,
  table = "scoreboard_actions",
) {
  const result = await queryWritableDB(
    `SELECT * FROM ${table} WHERE id = 1`,
    dialect,
  );
  expect(result.rows[0].score).toBe(value);
}

/** Port of the spec-local resetAndVerifyScoreValue. */
export async function resetAndVerifyScoreValue(
  dialect: WritebackDialect,
  table = "scoreboard_actions",
) {
  await queryWritableDB(
    `UPDATE ${table} SET score = 0 WHERE id = 1`,
    dialect,
  );
  await verifyScoreValue(0, dialect, table);
}

/**
 * cy.findAllByTestId("form-field-container").filter(":contains('X')") — the
 * action-editor form field row whose text contains X (Cypress `:contains` is a
 * case-sensitive substring).
 */
export function formFieldContainer(scope: Page | Locator, text: string) {
  return scope
    .getByTestId("form-field-container")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
