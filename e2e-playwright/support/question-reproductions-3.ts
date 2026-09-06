/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-3.cy.spec.js.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { queryWritableDB } from "./actions-on-dashboards";
import { miniPicker } from "./notebook";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres containers and their postgres-12 / postgres-writable snapshots (set PW_QA_DB_ENABLED)";

export const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** The "@dataset" alias: POST /api/dataset. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** The "@cardQuery" alias H.visitQuestion registers: POST /api/card/:id/query. */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/card/pivot/:id/query — the "@cardPivotQuery" alias. */
export function waitForCardPivotQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/pivot\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

/** The "@updateCard" / "@updateQuestion" aliases: PUT /api/card/:id. */
export function waitForUpdateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * `H.visualize()` for a question that may already be SAVED. The shared
 * notebook.ts `visualize` waits strictly on POST /api/dataset, which is right
 * for ad-hoc questions; a saved card re-runs through POST /api/card/:id/query
 * instead (the documented saved-vs-ad-hoc endpoint split). Waits for either.
 */
export async function visualizeEitherEndpoint(page: Page) {
  const query = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    const { pathname } = new URL(response.url());
    return (
      pathname === "/api/dataset" || /^\/api\/card\/\d+\/query$/.test(pathname)
    );
  });
  await page.getByRole("button", { name: "Visualize", exact: true }).click();
  return query;
}

// === misc ===

/** Port of the beforeEach that switches the current user's locale (issue 33079). */
export async function setCurrentUserLocale(api: MetabaseApi, locale: string) {
  const { id } = (await (await api.get("/api/user/current")).json()) as {
    id: number;
  };
  await api.put(`/api/user/${id}`, { locale });
}

/**
 * Port of H.moveColumnDown (e2e-ui-elements-helpers.js): a raw 4-event mouse
 * sequence at element-relative offsets — mousedown(0,0), mousemove(5,5) to
 * clear the sensor's activation constraint, mousemove(0, distance*50), and
 * mouseup at the same point. Dispatched synthetically inside one evaluate
 * (the rect is read there, so a re-render can't null it out), matching
 * Cypress's `.trigger(..., { force: true })` semantics — which dispatch at the
 * resolved element rather than moving a real mouse.
 */
export async function moveColumnDown(column: Locator, distance: number) {
  await column.evaluate(async (el, distance) => {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const options = { bubbles: true, cancelable: true, button: 0 };
    const { x, y } = el.getBoundingClientRect();
    const fire = (type: string, dx: number, dy: number) =>
      el.dispatchEvent(
        new MouseEvent(type, { ...options, clientX: x + dx, clientY: y + dy }),
      );

    fire("mousedown", 0, 0);
    await sleep(200);
    fire("mousemove", 5, 5);
    await sleep(200);
    fire("mousemove", 0, distance * 50);
    await sleep(200);
    fire("mouseup", 0, distance * 50);
    await sleep(200);
  }, distance);
}

/** Port of the spec's module-level assertPlanFieldValues (issue 34414). */
export async function assertPlanFieldValues(scope: Locator) {
  await expect(scope.getByText("Basic", { exact: true })).toBeVisible();
  await expect(scope.getByText("Business", { exact: true })).toBeVisible();
  await expect(scope.getByText("Premium", { exact: true })).toBeVisible();
}

/** Port of the spec's module-level removeFilter (issue 42010). */
export async function removeFilter(page: Page) {
  await page.getByTestId("filter-pill").getByLabel("Remove").click();
  await expect(page.getByTestId("question-row-count")).toHaveText(
    "Showing 2 rows",
  );
}

/**
 * Port of `H.saveQuestion()` called with NO name and no pickEntity options:
 * open the save modal, leave the suggested name and the default target
 * untouched, save, and check the "Saved" toast when the card landed in a
 * collection rather than a dashboard (checkSavedToCollectionQuestionToast).
 */
export async function saveQuestionWithDefaults(page: Page) {
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByTestId("save-question-modal")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  const body = (await (await saveResponse).json()) as {
    id: number;
    dashboard_id: number | null;
  };
  if (!body.dashboard_id) {
    await expect(
      page.getByTestId("toast-undo").getByText(/Saved/i),
    ).toBeVisible();
  }
  return body.id;
}

/**
 * Pick an entry in the notebook's mini picker by typing into its search box.
 * Port of `cy.realType(name)` + `H.miniPicker().findByText(name).click()` —
 * `realType` goes to the picker's autofocused input, which Playwright has to
 * click first. Retries the typing because a search fired inside the
 * post-restore reindex window returns empty and the picker never re-queries
 * (same guard as joins.ts joinTable).
 */
export async function searchMiniPickerAndSelect(page: Page, name: string) {
  const searchInput = page.getByPlaceholder("Search for tables and more...", {
    exact: true,
  });
  await searchInput.click();
  await page.keyboard.type(name);

  const result = miniPicker(page).getByText(name, { exact: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await expect(result).toBeVisible({ timeout: 4000 });
      break;
    } catch {
      await searchInput.fill("");
      await page.keyboard.type(name);
    }
  }
  await result.click();
}

/**
 * Port of `H.resetTestTable({ type: "postgres", table: "uuid_pk_table" })`
 * (cy.task("resetTable") → e2e/support/test_tables.js uuid_pk_table). The
 * shared resetTestTable in actions-on-dashboards.ts only knows the two tables
 * that spec needs, and shared modules are off limits here, so the same DDL is
 * issued directly against the writable container.
 *
 * NOTE (FINDINGS #85): `writable_db` is shared across all five slots. This only
 * drops/recreates its OWN table in `public` and never touches foreign schemas.
 */
export async function resetUuidPkTable() {
  await queryWritableDB("DROP TABLE IF EXISTS uuid_pk_table", "postgres");
  await queryWritableDB(
    'CREATE TABLE uuid_pk_table (id uuid NOT NULL PRIMARY KEY, name varchar(255))',
    "postgres",
  );
  await queryWritableDB(
    `INSERT INTO uuid_pk_table (id, name) VALUES
       ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Duck'),
       ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Rabbit')`,
    "postgres",
  );
}

/** The `relfilenode` of a table in the writable postgres container — changes
 * whenever the table is dropped and recreated, so it proves the QA-DB reset
 * really executed (read-only probe, safe on the shared container). */
export async function writableTableRelfilenode(
  tableName: string,
): Promise<string | undefined> {
  const { rows } = await queryWritableDB(
    `SELECT relfilenode FROM pg_class WHERE relname = '${tableName}'`,
    "postgres",
  );
  return rows[0]?.relfilenode as string | undefined;
}

/**
 * NO_COLLECTION_PERSONAL_COLLECTION_ID (cypress_sample_instance_data.js),
 * resolved through the API as the signed-in user so the port doesn't have to
 * import the untyped instance-data module.
 */
export async function currentUserPersonalCollectionId(
  api: MetabaseApi,
): Promise<number> {
  const user = (await (await api.get("/api/user/current")).json()) as {
    personal_collection_id: number;
  };
  return user.personal_collection_id;
}
