/**
 * Helpers for the collections/uploads spec port
 * (e2e/test/scenarios/collections/uploads.cy.spec.js).
 *
 * Module name matches the target spec basename exactly:
 *   tests/collections-uploads.spec.ts  <->  support/collections-uploads.ts
 * (no deviation — a mismatched name shipped a dangling import on a previous
 * batch and failed collection on every CI shard).
 *
 * Everything here is a port of `e2e/support/helpers/e2e-upload-helpers.js`
 * plus the two local helpers defined at the bottom of the upstream spec
 * (`uploadFileToCollection`, `uploadToExisting`). It lives in its own file so
 * the shared support modules stay untouched (PORTING.md rule 9).
 *
 * This is a WRITE tier: every valid upload CREATEs a real table in the shared
 * QA container. `dropUploadTables` / `dropSchema` at the bottom exist so the
 * spec can put the container back the way it found it — four other slots share
 * that instance.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";

import type { MetabaseApi } from "./api";
import type { WritebackDialect } from "./actions-on-dashboards";
import { WRITABLE_DB_ID } from "./schema-viewer";
import type { SnowplowCollector } from "./snowplow-collector";
import { modal, popover } from "./ui";

/**
 * Port of FIXTURE_PATH from e2e-upload-helpers.js. Cypress resolves it through
 * `cy.fixture` (relative to the Cypress fixtures root); Playwright reads the
 * bytes off disk, so this is an absolute path to the same directory.
 */
export const FIXTURE_DIR = path.resolve(
  __dirname,
  "../../e2e/support/assets",
);

export type CsvTestFile = {
  valid: boolean;
  fileName: string;
  tableName?: string;
  humanName?: string;
  rowCount?: number;
};

/** Port of VALID_CSV_FILES (e2e/support/helpers/e2e-upload-helpers.js). */
export const VALID_CSV_FILES: CsvTestFile[] = [
  {
    valid: true,
    fileName: "dog_breeds.csv",
    tableName: "dog_breeds",
    humanName: "Dog Breeds",
    rowCount: 97,
  },
  {
    valid: true,
    fileName: "star_wars_characters.csv",
    tableName: "star_wars_characters",
    humanName: "Star Wars Characters",
    rowCount: 87,
  },
  {
    valid: true,
    fileName: "pokedex.tsv",
    tableName: "pokedex",
    humanName: "Pokedex",
    rowCount: 202,
  },
];

/** Port of INVALID_CSV_FILES. */
export const INVALID_CSV_FILES: CsvTestFile[] = [
  {
    valid: false,
    fileName: "invalid.csv",
  },
];

/**
 * Port of H.enableUploads(dialect). Note it points uploads at WRITABLE_DB_ID
 * (2) — which database that actually IS depends on the snapshot in force:
 * under `postgres-writable`/`mysql-writable` it is the writable container
 * (`writable_db`); under `postgres-12` it is the READ-ONLY QA sample
 * (`sample`). Upstream does the latter in the `permissions` and
 * `Upload Table Cleanup/Management` describes, and it really does create
 * tables in the QA sample database. See the spec header.
 */
export async function enableUploads(api: MetabaseApi, dialect: WritebackDialect) {
  await api.put("/api/setting", {
    "uploads-settings": {
      db_id: WRITABLE_DB_ID,
      schema_name: dialect === "postgres" ? "public" : null,
      table_prefix: dialect === "mysql" ? "upload_" : null,
    },
  });
}

/** The bytes + metadata Playwright's `setInputFiles` wants for a fixture. */
export function fixturePayload(testFile: CsvTestFile) {
  return {
    name: testFile.fileName,
    // Upstream passes `mimeType: "text/csv"` for every fixture, including
    // pokedex.tsv. Kept verbatim.
    mimeType: "text/csv",
    buffer: fs.readFileSync(path.join(FIXTURE_DIR, testFile.fileName)),
  };
}

type UploadMode = "upload" | "append" | "replace";

const UPLOAD_ENDPOINTS: Record<UploadMode, RegExp> = {
  upload: /^\/api\/upload\/csv$/,
  append: /^\/api\/table\/\d+\/append-csv$/,
  replace: /^\/api\/table\/\d+\/replace-csv$/,
};

/**
 * Port of rule 2 for the upload endpoints: registered BEFORE the triggering
 * `setInputFiles`, awaited after. Matches on pathname + method, like every
 * other port.
 */
export function waitForUpload(page: Page, mode: UploadMode) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      UPLOAD_ENDPOINTS[mode].test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

export function statusRoot(page: Page): Locator {
  return page.getByTestId("status-root-container");
}

/**
 * Port of H.uploadFile(inputId, collectionName, testFile, uploadMode).
 *
 * File input: `setInputFiles` on the `<input type=file>` itself. The product's
 * `UploadInput` is `display: none` inside a `<label>`, which is exactly the
 * case `setInputFiles` is specified to handle (it does not require visibility),
 * so no drag-drop emulation and no `force` equivalent is needed. Cypress used
 * `selectFile(..., { force: true })` for the same reason.
 */
export async function uploadFile(
  page: Page,
  inputSelector: string,
  collectionName: string,
  testFile: CsvTestFile,
  uploadMode: UploadMode = "upload",
) {
  const uploaded = waitForUpload(page, uploadMode);

  await page.locator(inputSelector).setInputFiles(fixturePayload(testFile));

  if (testFile.valid) {
    // Upstream: `.should("contain", "Uploading data to").and("contain", fileName)`.
    // A bare `should("contain", x)` on a single-element subject is a plain
    // substring check on that element's text; the status root is a single
    // container, so `toContainText` twice is the faithful port.
    await expect(statusRoot(page)).toContainText("Uploading data to");
    await expect(statusRoot(page)).toContainText(testFile.fileName);

    await uploaded;

    await expect(
      page
        .getByRole("status")
        .last()
        .getByText(`Data added to ${collectionName}`, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  } else {
    await uploaded;

    await expect(
      statusRoot(page).getByText("Error uploading your file", { exact: true }),
    ).toBeVisible();

    await expect(
      modal(page).getByText("Upload error details", { exact: true }),
    ).toBeVisible();
  }
}

/**
 * Port of the spec-local `uploadFileToCollection(testFile, viewModel = true)`.
 * `collectionId` replaces the `@collectionId` Cypress alias.
 */
export async function uploadFileToCollection(
  page: Page,
  collectionId: number,
  testFile: CsvTestFile,
  { viewModel = true }: { viewModel?: boolean } = {},
) {
  await page.goto(`/collection/${collectionId}`);

  await uploadFile(page, "#upload-input", "Uploads Collection", testFile);

  if (testFile.valid && viewModel) {
    await expect(
      page.locator("main").getByText("Uploads Collection", { exact: true }),
    ).toBeVisible();

    await expect(
      page
        .getByTestId("collection-table")
        .getByText(testFile.humanName as string, { exact: true }),
    ).toBeVisible();

    // Upstream waits on the "@dataset" alias registered in the outer
    // beforeEach; register before the click that triggers it.
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
      { timeout: 60_000 },
    );

    await statusRoot(page)
      .getByText("Start exploring", { exact: true })
      .click();

    await dataset;

    await expect(page).toHaveURL(/\/model\//);
    // Port of H.tableInteractive().
    await expect(page.getByTestId("table-root")).toBeVisible();
  }
}

const UPLOAD_OPTIONS: Record<"append" | "replace", string> = {
  append: "Append data to this model",
  replace: "Replace all data in this model",
};

/** Port of the spec-local `uploadToExisting({...})`. */
export async function uploadToExisting(
  page: Page,
  {
    testFile,
    identicalSchema = true,
    uploadMode = "append",
  }: {
    testFile: CsvTestFile;
    identicalSchema?: boolean;
    uploadMode?: "append" | "replace";
  },
) {
  // Upstream: `cy.findByTestId("qb-header").icon("upload").click()`. The QB
  // header carries exactly one upload icon, on the button testid'd
  // `qb-header-append-button`; scoping to it rather than to the icon class is
  // the same element, chosen for stability (PORTING rule 3 — scope, don't
  // `.first()`).
  await page.getByTestId("qb-header-append-button").click();

  const uploaded = waitForUpload(page, uploadMode);

  await popover(page)
    .getByText(UPLOAD_OPTIONS[uploadMode], { exact: true })
    .click();

  await page
    .locator("#upload-file-input")
    .setInputFiles(fixturePayload(testFile));

  if (identicalSchema) {
    await expect(statusRoot(page)).toContainText("Uploading data to");
    await expect(statusRoot(page)).toContainText(testFile.fileName);

    await uploaded;

    await expect(
      page
        .getByRole("status")
        .last()
        .getByText(/Data (added|replaced)/i),
    ).toBeVisible({ timeout: 10_000 });
  } else {
    await uploaded;

    await expect(
      statusRoot(page).getByText("Error uploading your file", { exact: true }),
    ).toBeVisible();

    await expect(
      modal(page).getByText("Upload error details", { exact: true }),
    ).toBeVisible();
  }
}

/**
 * Port of H.headlessUpload(collectionId, file).
 *
 * Cypress issues this as a `cy.request` multipart POST that inherits the
 * browser's session cookie. `MetabaseApi` has no multipart path and does not
 * expose its session id, so this runs the same request *inside the page*,
 * where the cookie already is — the closest analogue of cy.request's
 * cookie-sharing behaviour, and it keeps the auth model identical.
 *
 * The page must already be on the app origin (a relative URL is used, exactly
 * as upstream does).
 */
export async function headlessUpload(
  page: Page,
  collectionId: number,
  file: CsvTestFile,
) {
  const base64 = fs
    .readFileSync(path.join(FIXTURE_DIR, file.fileName))
    .toString("base64");

  const status = await page.evaluate(
    async ({ base64, fileName, collectionId }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const formData = new FormData();
      formData.append("file", new Blob([bytes]), fileName);
      formData.append("collection_id", String(collectionId));
      // NOTE: no explicit content-type — the browser must set the multipart
      // boundary. Upstream passes `"content-type": "multipart/form-data"`,
      // which Cypress replaces with a boundary-bearing header for FormData
      // bodies; setting it by hand here would produce a boundary-less header
      // and a 400.
      const response = await fetch("/api/upload/csv", {
        method: "POST",
        body: formData,
      });
      return response.status;
    },
    { base64, fileName: file.fileName, collectionId },
  );

  expect(status, `POST /api/upload/csv for ${file.fileName}`).toBe(200);
}

/**
 * Collector-side port of
 * `H.expectUnstructuredSnowplowEvent({ event: "csv_upload_successful" })`.
 *
 * `csvupload` events are **backend-emitted** (`src/metabase/upload/impl.clj`
 * -> `analytics.core/track-event! :snowplow/csvupload`), so the browser-boundary
 * capture in support/search-snowplow.ts is structurally blind to them and this
 * has to assert at the slot's own collector. The shared
 * `expectCollectedSnowplowEvent` matches on the schema-derived event NAME
 * (`csvupload` for every one of these), whereas upstream matches on the
 * payload's `event` field, so the match is done here instead.
 *
 * Upstream's `expectUnstructuredSnowplowEvent` defaults to count 1 and asserts
 * an EXACT count of matching events, which is what this reproduces.
 */
export async function expectCsvUploadEvent(
  collector: SnowplowCollector,
  event: "csv_upload_successful" | "csv_upload_failed",
  count = 1,
  timeout = 60_000,
) {
  await expect
    .poll(
      () =>
        collector.events.filter(
          (collected) =>
            collected.eventName === "csvupload" &&
            collected.data.event === event,
        ).length,
      {
        timeout,
        message:
          `expected ${count} collector-side csvupload event(s) with event="${event}"; ` +
          `saw ${JSON.stringify(
            collector.events.map((collected) => ({
              schema: collected.schema,
              event: collected.data.event,
            })),
          )}`,
      },
    )
    .toBe(count);
}

// === container hygiene =====================================================
//
// Upload tables are named `<tableName>_<yyyyMMddHHmmss>` (plus the mysql
// `upload_` prefix). None of them exist before this spec runs, so dropping
// exactly that shape restores the container without touching anything a
// sibling slot owns. FINDINGS #85: foreign SCHEMAS are never dropped — only
// `empty_uploads`, which this spec creates itself.

const UPLOAD_TABLE_PREFIXES = [
  "dog_breeds",
  "star_wars_characters",
  "pokedex",
  // `invalid.csv` never produces a table in normal operation. It is listed
  // because the documented mutation for this spec makes that fixture VALID,
  // and the resulting `invalid_<timestamp>` table would otherwise be left in
  // the shared container.
  "invalid",
];

/**
 * The shared `queryWritableDB` (support/actions-on-dashboards.ts) is pinned to
 * the `writable_db` database. Two of this spec's describes restore
 * `postgres-12`, where WRITABLE_DB_ID (2) is the QA sample database instead, so
 * cleanup needs to reach a second database on the same container. Same
 * connection facts as `WRITABLE_DB_CONFIG` / `QA_DB_CREDENTIALS`
 * (e2e/support/cypress_data.js); `knex` resolves from the repo-root
 * node_modules, hence the lazy require.
 */
type KnexLike = {
  raw(sql: string): Promise<unknown>;
  destroy(): Promise<void>;
};

export async function queryQaDB(
  query: string,
  dialect: WritebackDialect,
  database: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexLike;
  const client = Knex(
    dialect === "postgres"
      ? {
          client: "pg",
          connection: {
            host: "localhost",
            user: "metabase",
            password: "metasample123",
            database,
            port: 5404,
            ssl: false,
          },
        }
      : {
          client: "mysql2",
          connection: {
            host: "localhost",
            user: "root",
            password: "metasample123",
            database,
            port: 3304,
            multipleStatements: true,
          },
        },
  );
  try {
    const result = (await client.raw(query)) as
      | { rows: Record<string, unknown>[] }
      | [Record<string, unknown>[], unknown];
    if (dialect === "mysql") {
      return { rows: (result as [Record<string, unknown>[], unknown])[0] };
    }
    return result as { rows: Record<string, unknown>[] };
  } finally {
    await client.destroy();
  }
}

/**
 * Schemas of `writable_db` that hold at least one table, other than the
 * `empty_uploads` schema this spec creates itself.
 *
 * Why this exists (FINDINGS #85, and MEASURED here rather than assumed):
 * upstream's "Can upload a CSV file to an empty postgres schema" finishes by
 * asserting `TablePicker.getTables()` has length 2 straight after clicking the
 * DATABASE row. That only holds when the database has exactly one *visible*
 * schema, because the admin table picker collapses the schema level away in
 * that case and renders table nodes directly. On a fresh CI container
 * `writable_db` has only an empty `public` (never synced, no tables) plus
 * `empty_uploads` — one visible schema, two tables, upstream's number.
 *
 * On this shared dev box the same database carries 29 schemas
 * (`Domestic`, `Wild`, `Schema A`…`Schema Z`, `public` with 5 tables), left by
 * other specs that never clean up. Measured after the resync this test
 * performs: `GET /api/database/2/schemas` returns 29 entries, so the picker
 * renders 29 SCHEMA nodes and ZERO table nodes. No port can pass that
 * assertion here, and weakening it would hide a real regression on CI.
 *
 * Deliberately read-only — sibling slots are live, nothing is dropped.
 */
export async function foreignWritableSchemasWithTables(): Promise<string[]> {
  const { rows } = await queryQaDB(
    `SELECT DISTINCT table_schema FROM information_schema.tables ` +
      `WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'empty_uploads') ` +
      `ORDER BY table_schema;`,
    "postgres",
    "writable_db",
  );
  return rows.map((row) => String(row.table_schema));
}

/** Tables this spec's uploads created, in one schema of one database. */
export async function listUploadTables(
  dialect: WritebackDialect,
  { database, schema }: { database: string; schema: string },
): Promise<string[]> {
  const likes = UPLOAD_TABLE_PREFIXES.flatMap((prefix) => [
    // `_` is a LIKE wildcard rather than a literal here, which only widens the
    // match to `dogXbreedsX…`-shaped names — nothing on these containers.
    `'${prefix}_%'`,
    `'upload_${prefix}_%'`,
  ]).join(" OR table_name LIKE ");

  const { rows } = await queryQaDB(
    `SELECT table_name FROM information_schema.tables ` +
      `WHERE table_schema = '${schema}' AND (table_name LIKE ${likes}) ` +
      `ORDER BY table_name;`,
    dialect,
    database,
  );
  return rows.map((row) => String(row.table_name ?? row.TABLE_NAME));
}

export async function dropUploadTables(
  dialect: WritebackDialect,
  { database, schema }: { database: string; schema: string },
): Promise<string[]> {
  const tables = await listUploadTables(dialect, { database, schema });
  for (const table of tables) {
    const qualified =
      dialect === "postgres" ? `"${schema}"."${table}"` : `\`${table}\``;
    await queryQaDB(`DROP TABLE IF EXISTS ${qualified};`, dialect, database);
  }
  return tables;
}
