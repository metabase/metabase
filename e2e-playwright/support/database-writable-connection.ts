/**
 * Helpers for the database-writable-connection spec port
 * (e2e/test/scenarios/admin/databases/database-writable-connection.cy.spec.ts).
 *
 * Own module per PORTING.md rule 9 — no shared support file is edited. Almost
 * everything this spec needs already exists elsewhere and is imported
 * read-only:
 *
 * - `queryWritableDB`                  → support/actions-on-dashboards.ts
 * - `WRITABLE_DB_ID`/`getTableId`/`resyncDatabase` → support/schema-viewer.ts
 * - `createTransform` / `runTransformAndWaitForSuccess` → support/dependency-graph.ts
 * - `createTransformTag`/`createTransformJob`/`waitForSucceededTransformRuns`
 *                                      → support/transforms.ts
 * - `createTestNativeQuery` / `createCard` → support/native-reproductions.ts
 * - `createAction`                     → support/actions-on-dashboards.ts
 * - `enableUploads`/`VALID_CSV_FILES`/`FIXTURE_DIR` → support/collections-uploads.ts
 * - `modal`                            → support/ui.ts
 * - `openQuestionActions`              → support/models.ts
 * - `FIRST_COLLECTION_ID`              → support/sample-data.ts
 *
 * Only two things had no home: `runTransformAndWaitForFailure` (the success
 * twin is ported, the failure one is not) and the writable-connection form
 * driving itself.
 */
import fs from "fs";
import path from "path";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { queryWritableDB } from "./actions-on-dashboards";
import { FIXTURE_DIR, type CsvTestFile } from "./collections-uploads";
import { modal } from "./ui";

export type DatabaseCredentials = {
  username: string;
  password: string;
};

/** Port of `H.queryWritableDB(query, "mysql")` — the spec's `queryDB`. */
export function queryDB(query: string) {
  return queryWritableDB(query, "mysql");
}

// === the admin database page's info sections ===

/** `cy.findByTestId("database-connection-info-section")` */
export function mainConnectionSection(page: Page): Locator {
  return page.getByTestId("database-connection-info-section");
}

/** `cy.findByTestId("writable-connection-info-section")` */
export function writableConnectionSection(page: Page): Locator {
  return page.getByTestId("writable-connection-info-section");
}

/**
 * `cy.findByTestId("database-connection-health-info")`.
 *
 * Upstream always calls this INSIDE a `.within()` of one of the two sections
 * (both render one), so every call site here takes the section as its scope.
 * An unscoped page-level locator would be a strict-mode violation once a
 * writable connection exists — and, worse, would silently assert against the
 * wrong section if it didn't.
 */
export function connectionHealthInfo(scope: Locator): Locator {
  return scope.getByTestId("database-connection-health-info");
}

// === the writable-connection form ===

/**
 * Port of `fillInCredentials` —
 * `cy.findByLabelText("Username").clear().type(value)` for both fields.
 *
 * NOT `fill()`. The form is `DatabaseForm` (Formik) and its submit button is
 * `disabled={!isDirty}` (DatabaseFormFooter.tsx:67), so the port must produce
 * real per-character input events and then blur, exactly as PORTING.md's
 * EditableText/Formik rule requires. `fill()` sets the value in one shot and
 * can leave Formik's dirty state unset, which surfaces 30s later as "Save is
 * disabled" rather than as a typing problem.
 *
 * The blur is also load-bearing for a second reason: `WritableConnectionInfoPage`
 * strips `password` out of the initial values, so the Password field starts
 * empty and the field must commit before submit reads it.
 */
export async function fillInCredentials(
  page: Page,
  { username, password }: DatabaseCredentials,
) {
  await typeIntoField(page, "Username", username);
  await typeIntoField(page, "Password", password);
}

async function typeIntoField(page: Page, label: string, value: string) {
  // `findByLabelText` with a string arg is EXACT in testing-library
  // (PORTING rule 1).
  const field = page.getByLabel(label, { exact: true });
  await field.click();
  await field.clear();
  await field.pressSequentially(value);
  await field.blur();
}

/**
 * `cy.button(name)` → `findByRole("button", { name })`, i.e. an EXACT
 * testing-library name match.
 *
 * Asserts the button is enabled before clicking. Playwright reads `disabled`
 * off ancestors too, so this also catches a disabled fieldset — but the real
 * reason it is here is the Formik `isDirty` gate above: clicking a disabled
 * submit is a silent no-op in Playwright, and the failure would land on a
 * later assertion with no trace of the cause.
 */
async function clickButton(scope: Page | Locator, name: string) {
  const button = scope.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

/**
 * Port of `createWritableConnection`. `getWritableConnectionInfoSection()
 * .findByText("Add writable connection").click()` → fill → Save → the section
 * is visible again.
 *
 * That trailing visibility assertion is the navigation gate: the form lives on
 * a separate route (`/admin/databases/:id/write-data`), so the section is
 * absent from the DOM until `handleSubmit`'s `push(viewDatabase(id))` lands.
 * It is a genuine wait, not a tautology.
 */
export async function createWritableConnection(
  page: Page,
  credentials: DatabaseCredentials,
) {
  await writableConnectionSection(page)
    .getByText("Add writable connection", { exact: true })
    .click();
  await fillInCredentials(page, credentials);
  await clickButton(page, "Save");
  await expect(writableConnectionSection(page)).toBeVisible();
}

/** Port of `updateWritableConnection`. */
export async function updateWritableConnection(
  page: Page,
  credentials: DatabaseCredentials,
) {
  await writableConnectionSection(page)
    .getByText("Edit connection details", { exact: true })
    .click();
  await fillInCredentials(page, credentials);
  await clickButton(page, "Save changes");
  await expect(writableConnectionSection(page)).toBeVisible();
}

/**
 * Port of `updateMainConnection`. Note both sections render an "Edit connection
 * details" control, so the scoping to the MAIN section is required, not
 * cosmetic.
 */
export async function updateMainConnection(
  page: Page,
  credentials: DatabaseCredentials,
) {
  await mainConnectionSection(page)
    .getByText("Edit connection details", { exact: true })
    .click();
  await fillInCredentials(page, credentials);
  await clickButton(page, "Save changes");
  await expect(mainConnectionSection(page)).toBeVisible();
}

/** Port of `removeWritableConnection` (button + confirmation modal). */
export async function removeWritableConnection(page: Page) {
  await clickButton(
    writableConnectionSection(page),
    "Remove writable connection",
  );
  await clickButton(modal(page), "Remove");
  await expect(writableConnectionSection(page)).toBeVisible();
}

// === transform runs ===

/**
 * Port of `H.runTransformAndWaitForFailure` (e2e-transform-helpers.ts:58) —
 * `runTransformAndWaitForStatus(id, "failed")`, i.e. POST the run then
 * `retryRequest` the run endpoint until `status === "failed"`.
 *
 * The success twin already lives in support/dependency-graph.ts; only the
 * failure direction was missing. Same 10s/100ms budget as upstream's
 * `retryRequest` defaults (e2e-request-helpers.ts:32-33), widened to 30s
 * because a *failing* run has to wait out the driver's connection attempt.
 */
export async function runTransformAndWaitForFailure(
  api: MetabaseApi,
  transformId: number,
  timeout = 30_000,
): Promise<void> {
  await runTransformAndWaitForStatus(api, transformId, "failed", timeout);
}

async function runTransformAndWaitForStatus(
  api: MetabaseApi,
  transformId: number,
  status: string,
  timeout: number,
) {
  const runResponse = await api.post(`/api/transform/${transformId}/run`);
  const { run_id } = (await runResponse.json()) as { run_id: number };

  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get(`/api/transform/run/${run_id}`, {
      failOnStatusCode: false,
    });
    if (response.status() === 200) {
      const body = (await response.json()) as { status: string };
      if (body.status === status) {
        return;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Transform run ${run_id} did not reach "${status}" within ${timeout}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// === model persistence ===

/**
 * Port of `refreshModelPersistenceAndAwaitStatus` — POST the refresh, then
 * `retryRequest(GET /api/persist/card/:id, body.state === state)`.
 */
export async function refreshModelPersistenceAndAwaitStatus(
  api: MetabaseApi,
  modelId: number,
  state: "error" | "persisted",
  timeout = 30_000,
) {
  await api.post(`/api/persist/card/${modelId}/refresh`);

  const deadline = Date.now() + timeout;
  for (;;) {
    const response = await api.get(`/api/persist/card/${modelId}`, {
      failOnStatusCode: false,
    });
    if (response.status() === 200) {
      const body = (await response.json()) as { state: string };
      if (body.state === state) {
        return;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Model ${modelId} persistence did not reach "${state}" within ${timeout}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Port of `enablePersistenceForModel`. */
export async function enablePersistenceForModel(
  api: MetabaseApi,
  modelId: number,
) {
  await api.post(`/api/persist/card/${modelId}/persist`);
}

// === API calls the spec asserts status codes on ===

/**
 * Ports of `runAction` / `performTableEdit` / `performUpload`. Upstream sends
 * these with `failOnStatusCode: false` and asserts the status directly
 * (`expectFailure` = `>= 400`, `expectSuccess` = `< 400`), so they return the
 * raw status rather than throwing.
 */
export async function runAction(
  api: MetabaseApi,
  actionId: number,
): Promise<number> {
  const response = await api.post(
    `/api/action/${actionId}/execute`,
    { parameters: {} },
    { failOnStatusCode: false },
  );
  return response.status();
}

export async function performTableEdit(
  api: MetabaseApi,
  tableId: number,
): Promise<number> {
  const response = await api.post(
    "/api/ee/action-v2/execute-bulk",
    {
      action: "data-grid.row/create",
      scope: { "table-id": tableId },
      inputs: [{ ID: 42 }],
    },
    { failOnStatusCode: false },
  );
  return response.status();
}

/**
 * Port of `performUpload`.
 *
 * Same in-page-`fetch` approach as the landed `headlessUpload`
 * (support/collections-uploads.ts): `MetabaseApi` has no multipart path, and
 * running the request inside the page reuses the session cookie exactly the
 * way `cy.request` does. This variant RETURNS the status instead of asserting
 * 200, because upstream posts with `failOnStatusCode: false` and feeds the
 * response to `expectFailure`/`expectSuccess`.
 *
 * The content-type header is deliberately omitted so the browser can set the
 * multipart boundary — see the note on `headlessUpload`.
 */
export async function performUpload(
  page: Page,
  file: CsvTestFile,
  collectionId: number,
): Promise<number> {
  const base64 = fs
    .readFileSync(path.join(FIXTURE_DIR, file.fileName))
    .toString("base64");

  return page.evaluate(
    async ({ base64, fileName, collectionId }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const formData = new FormData();
      formData.append("file", new Blob([bytes]), fileName);
      formData.append("collection_id", String(collectionId));
      const response = await fetch("/api/upload/csv", {
        method: "POST",
        body: formData,
      });
      return response.status;
    },
    { base64, fileName: file.fileName, collectionId },
  );
}
