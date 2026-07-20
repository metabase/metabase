/**
 * Playwright port of e2e/test/scenarios/collections/uploads.cy.spec.js
 *
 * Collision checks (done BEFORE writing anything):
 * - `grep -rl "collections/uploads.cy.spec\|collections-uploads" tests/ support/`
 *   → no hits.
 * - `ls tests/` → no `collections-uploads.spec.ts`. The neighbouring
 *   `collections.spec.ts`, `collections-cleanup.spec.ts`,
 *   `collections-permissions.spec.ts`, `collections-reproductions.spec.ts`,
 *   `collections-trash.spec.ts` and `collection-pinned-overview.spec.ts` were
 *   each read: all are ports of DIFFERENT sources under
 *   e2e/test/scenarios/collections/, none of them `uploads.cy.spec.js`.
 * - `ls e2e/test/scenarios/collections/` → no `.ts` sibling of `uploads`.
 *   PORTED FILE: `e2e/test/scenarios/collections/uploads.cy.spec.js`.
 * - Support module is `support/collections-uploads.ts` — matches this file's
 *   basename exactly, NO deviation.
 *
 * ── Infra tier, per describe (READ from the spec, not from the tags) ────────
 * All three top-level describes are `@external` and every one of them talks to
 * a QA container, so the whole file is gated on PW_QA_DB_ENABLED. The tags
 * themselves check out this time; what the tags do NOT tell you is *which*
 * database each describe writes to, and that differs:
 *
 *   describe "CSV Uploading"                       @external @actions
 *     "…empty postgres schema"   → postgres-writable → writable_db (:5404)
 *     "CSV Uploading (postgres)" → postgres-writable → writable_db.public
 *     "CSV Uploading (mysql)"    → mysql-writable    → writable_db (:3304)
 *     "…choose a model to append" → postgres-writable → writable_db.public
 *   describe "permissions"                          @external
 *     both tests             → postgres-12 → QA `sample` database (:5404)
 *   describe "Upload Table Cleanup/Management"      @external
 *     the one test           → postgres-12 → QA `sample` database (:5404)
 *
 * The WRITABLE_DB_ID red herring, resolved by checking the snapshot: db id 2 is
 * `Writable Postgres12` under `postgres-writable` (grep of
 * e2e/snapshots/postgres_writable.sql: 16 hits for "Writable Postgres12", zero
 * for "QA Postgres12") and `QA Postgres12` under `postgres-12` (16 hits, zero
 * for "Writable"). Both live in the SAME container
 * (`metabase-e2e-postgres-sample-1`, :5404) but in different databases:
 * `writable_db` vs `sample`. So the `permissions` / `Upload Table
 * Cleanup/Management` describes point uploads at the read-only QA sample and
 * really do CREATE TABLES in it. Upstream never cleans those up; this port
 * does (see the afterAll hooks), because four other slots share the instance.
 *
 * Container inventory is recorded before and after in
 * findings-inbox/collections-uploads.md.
 *
 * ── Token ──────────────────────────────────────────────────────────────────
 * Probed on slot 2 rather than assumed. `MB_PRO_SELF_HOSTED_TOKEN` yields 42
 * enabled features, and **`upload_management` is one of them** (so is
 * `sandboxes`). Uploading itself is OSS — only `/api/ee/upload-management/*`
 * is gated (`src/metabase/premium_features/settings.clj:234`). Nothing in this
 * spec is 402-blocked here.
 *
 * ── Snowplow vantage: the COLLECTOR, not the browser boundary ───────────────
 * `csv_upload_successful` / `csv_upload_failed` are **backend-emitted**:
 * `src/metabase/upload/impl.clj:686,691` calls
 * `analytics.core/track-event! :snowplow/csvupload`, which `snowplow.clj` hands
 * to a Java Tracker that POSTs from the JVM. Checked the other direction too —
 * `grep -rn "csvupload\|csv_upload" frontend/src` finds only the TS *type*
 * (`metabase-types/analytics/csv-upload.ts`) and some static-viz fixture JSON,
 * i.e. **no `trackSchemaEvent` call site**. So `installSnowplowCapture`
 * (browser boundary) is structurally blind to these and would have made every
 * assertion here a silent no-op. All snowplow assertions therefore run against
 * `mb.snowplow`, this slot's own `node:http` collector.
 * `snowplow.clj normalize-kw` turns `:csv-upload-successful` into
 * `"csv_upload_successful"`, which is why the payload matcher reads the way it
 * does.
 * `H.expectNoBadSnowplowEvents` ports to `expectNoBadCollectedSnowplowEvents`,
 * which really does Iglu-validate (support/iglu-validate.ts) — not degraded.
 *
 * ⚠️ RUN REQUIREMENT for the snowplow assertions: a slot backend whose Snowplow
 * emitter queue is EMPTY, i.e. a freshly booted JVM. `snowplow.clj` builds one
 * JVM-wide Java Tracker in a `defonce` with `EmitterConfiguration.batchSize(1)`,
 * and a POST that fails because nothing is listening on the collector port is
 * re-queued. Every backend event emitted while the per-slot collector is down —
 * which is the whole gap between two Playwright runs under
 * PW_KEEP_SLOT_BACKENDS=1 — therefore leaves the queue one deeper, permanently,
 * and the collector then receives event N-k while the test that caused event N
 * is watching. Measured on slot 2, with numbers, in
 * findings-inbox/collections-uploads.md. Consequence worth stating twice: with
 * an offset of 1 a test asserting `csv_upload_successful` PASSES on the previous
 * test's event, so the failure mode includes hollow green, not just red. CI is
 * unaffected (it boots a fresh backend per shard); on a dev box, kill the slot
 * backend before running this file.
 *
 * ── Port notes ─────────────────────────────────────────────────────────────
 * - The outer `beforeEach`'s three `cy.intercept(...).as()` aliases are used by
 *   the spec-local helpers, so they are ported as `waitForResponse` registered
 *   before the trigger inside those helpers (rule 2), not as file-level state.
 * - findByText / findByLabelText / findByRole(name) / cy.button with string
 *   args are EXACT in testing-library → `{ exact: true }` (rule 1).
 * - `cy.get("@collectionId")` (a Cypress alias) → a plain local `collectionId`.
 * - `H.uploadFile` used `selectFile(..., { force: true })` because the product's
 *   `<input type=file>` is `display:none`. Playwright's `setInputFiles` handles
 *   hidden inputs by specification, so it is used directly — no drag-drop
 *   emulation anywhere in this port.
 * - `cy.findByRole("dialog", { name: "Upload error details" })` — the error
 *   modal is a Mantine `Modal`. PORTING warns a Mantine Modal ROOT reports
 *   `hidden`; the `role="dialog"` node here is the modal *content*, which is
 *   visible, so `getByRole("dialog", { name })` is safe. Where the assertion is
 *   an ABSENCE (`should("not.exist")`), `toHaveCount(0)` is used — it retries,
 *   and it does not depend on visibility at all.
 * - `H.DataModel.TablePicker.*` → the shared `TablePicker` in support/data-model.ts.
 */
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { queryWritableDB } from "../support/actions-on-dashboards";
import {
  VALID_CSV_FILES,
  INVALID_CSV_FILES,
  dropUploadTables,
  enableUploads,
  expectCsvUploadEvent,
  fixturePayload,
  foreignWritableSchemasWithTables,
  headlessUpload,
  queryQaDB,
  uploadFileToCollection,
  uploadToExisting,
} from "../support/collections-uploads";
import { openCollectionMenu } from "../support/collections-core";
import { TablePicker } from "../support/data-model";
import { sandboxTable, updatePermissionsGraph } from "../support/dashboard-repros";
import { updateCollectionGraph } from "../support/click-behavior";
import { FIRST_COLLECTION_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { expectNoBadCollectedSnowplowEvents } from "../support/snowplow-collector";
import { modal, popover } from "../support/ui";
import type { MetabaseApi } from "../support/api";

const QA_DB_SKIP_MESSAGE =
  "Requires the QA Postgres/MySQL containers (writable_db on :5404 / :3304) " +
  "and their postgres-writable / mysql-writable / postgres-12 snapshots " +
  "(set PW_QA_DB_ENABLED)";

/** Port of USER_GROUPS from e2e/support/cypress_data.js. */
const ALL_USERS_GROUP = 1;
const NOSQL_GROUP = 8;

/** Port of the `cy.request("POST", "/api/collection", ...)` in the beforeEach. */
async function createUploadsCollection(api: MetabaseApi): Promise<number> {
  const response = await api.post("/api/collection", {
    name: "Uploads Collection",
    parent_id: null,
  });
  const { id } = (await response.json()) as { id: number };
  return id;
}

test.describe("CSV Uploading", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);

  test("Can upload a CSV file to an empty postgres schema", async ({
    mb,
    page,
  }) => {
    const testFile = VALID_CSV_FILES[0];
    const EMPTY_SCHEMA_NAME = "empty_uploads";

    // FINDINGS #85. This test's final assertion —
    // `TablePicker.getTables()` having length 2 immediately after clicking the
    // DATABASE row — only holds when `writable_db` has exactly one visible
    // schema, which is true of a fresh CI container and false of this shared
    // dev box. Measured, not assumed: after the resync below,
    // `GET /api/database/2/schemas` returns 29 schemas here, the picker renders
    // 29 schema nodes and 0 table nodes. Skipping up front rather than half-
    // running keeps the assertion verbatim for CI instead of weakening it.
    const foreignSchemas = await foreignWritableSchemasWithTables();
    test.skip(
      foreignSchemas.length > 0,
      `writable_db carries ${foreignSchemas.length} foreign schema(s) with tables ` +
        `(${foreignSchemas.join(", ")}); upstream's TablePicker count assumes a ` +
        `pristine container (FINDINGS #85)`,
    );

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();

    await queryWritableDB(
      "DROP SCHEMA IF EXISTS empty_uploads CASCADE;",
      "postgres",
    );
    await queryWritableDB(
      "CREATE SCHEMA IF NOT EXISTS empty_uploads;",
      "postgres",
    );
    // create a table because H.resyncDatabase has a check relying on tables count > 0
    await queryWritableDB(
      "CREATE TABLE empty_uploads.empty_table ();",
      "postgres",
    );
    // Make sure to resync the db because otherwise "public" schema sometimes is there but sometimes is not
    //
    // PORTING: the bare form of resyncDatabase can be satisfied instantly by a
    // stale `initial_sync_status: "complete"`. Pass the table this reset just
    // created so the wait is genuine — upstream's bare `H.resyncDatabase({
    // dbId })` only waits for "some table is complete", which any of the
    // pre-existing `public` tables already satisfies. This is a strengthening
    // of the wait, not of an assertion.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["empty_table"],
    });

    const collectionId = await createUploadsCollection(mb.api);

    const saveSettings = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/setting\//.test(new URL(response.url()).pathname),
    );
    const databaseList = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/database",
    );

    await page.goto("/admin/settings/uploads");
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

    const uploadForm = page.getByLabel("Upload Settings Form", { exact: true });

    await uploadForm
      .getByPlaceholder("Select a database", { exact: true })
      .click();
    await popover(page)
      .getByText("Writable Postgres12", { exact: true })
      .click();
    await uploadForm
      .getByPlaceholder("Select a schema", { exact: true })
      .click();

    await popover(page).getByText(EMPTY_SCHEMA_NAME, { exact: true }).click();

    await uploadForm
      .getByRole("button", { name: "Enable uploads", exact: true })
      .click();

    await saveSettings;
    await databaseList;

    await uploadFileToCollection(page, collectionId, testFile);

    const tableQuery =
      `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ` +
      `ORDER BY table_name DESC LIMIT 1;`;

    const created = await queryWritableDB(tableQuery, "postgres");
    expect(created.rows.length).toEqual(1);
    const tableName = String(created.rows[0].table_name);
    const counted = await queryWritableDB(
      `SELECT count(*) FROM ${EMPTY_SCHEMA_NAME}.${tableName};`,
      "postgres",
    );
    expect(Number(counted.rows[0].count)).toEqual(testFile.rowCount);

    // Ensure that table is visible in admin without refreshing (metabase#38041)

    // Port of H.goToAdmin().
    await page.goto("/admin");

    await page.getByRole("link", { name: "Table Metadata", exact: true }).click();

    await TablePicker.getDatabase(page, "Writable Postgres12").click();
    await expect(TablePicker.getTables(page)).toHaveCount(2);
    await expect(TablePicker.getTable(page, "Dog Breeds")).toBeVisible();
  });

  for (const dialect of ["postgres", "mysql"] as const) {
    test.describe(`CSV Uploading (${dialect})`, () => {
      let collectionId: number;

      test.beforeEach(async ({ mb }) => {
        await mb.restore(`${dialect}-writable`);
        // Port of H.resetSnowplow (micro/reset), scoped to this slot.
        mb.snowplow.reset();
        await mb.signInAsAdmin();
        // Port of H.enableTracking().
        await mb.api.updateSetting("anon-tracking-enabled", true);

        collectionId = await createUploadsCollection(mb.api);
        await enableUploads(mb.api, dialect);
      });

      test.afterEach(async ({ mb }) => {
        expectNoBadCollectedSnowplowEvents(mb.snowplow);
      });

      for (const testFile of VALID_CSV_FILES) {
        test(`Can upload ${testFile.fileName} to a collection`, async ({
          mb,
          page,
        }) => {
          await uploadFileToCollection(page, collectionId, testFile);

          await expectCsvUploadEvent(mb.snowplow, "csv_upload_successful");

          const tableQuery =
            `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ` +
            `ORDER BY table_name DESC LIMIT 1;`;

          const created = await queryWritableDB(tableQuery, dialect);
          expect(created.rows.length).toEqual(1);
          const tableName = String(
            created.rows[0].table_name ?? created.rows[0].TABLE_NAME,
          );
          const counted = await queryWritableDB(
            `SELECT count(*) as count FROM ${tableName};`,
            dialect,
          );
          expect(Number(counted.rows[0].count)).toEqual(testFile.rowCount);
        });
      }

      for (const testFile of INVALID_CSV_FILES) {
        test(`Cannot upload ${testFile.fileName} to a collection`, async ({
          mb,
          page,
        }) => {
          await uploadFileToCollection(page, collectionId, testFile);

          await expectCsvUploadEvent(mb.snowplow, "csv_upload_failed");

          const tableQuery =
            `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ` +
            `ORDER BY table_name DESC LIMIT 1;`;

          // NOTE (faithful, but weak upstream): `testFile.tableName` is
          // UNDEFINED for the invalid fixture — INVALID_CSV_FILES entries carry
          // only `valid` and `fileName`. The LIKE pattern is therefore
          // `'%undefined_%'`, which matches nothing regardless of what the
          // upload did, so this "no table was created" check is VACUOUS
          // upstream. Recorded verbatim rather than strengthened (hard rule:
          // weak-but-faithful is recorded, not strengthened); see
          // findings-inbox/collections-uploads.md.
          const created = await queryWritableDB(tableQuery, dialect);
          expect(created.rows.length).toEqual(0);

          // metabase#55382
          await page
            .getByRole("dialog", { name: "Upload error details", exact: true })
            .getByRole("button", { name: "Close", exact: true })
            .click();

          await openCollectionMenu(page);
          await popover(page)
            .getByText("Move to trash", { exact: true })
            .click();
          await expect(
            page.getByRole("dialog", {
              name: "Upload error details",
              exact: true,
            }),
          ).toHaveCount(0);
        });
      }

      test.describe("CSV appends", () => {
        test("Can append a CSV file to an existing table", async ({ page }) => {
          await uploadFileToCollection(page, collectionId, VALID_CSV_FILES[0]);
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();

          await uploadToExisting(page, {
            testFile: VALID_CSV_FILES[0],
            uploadMode: "append",
          });
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(
                `Showing ${(VALID_CSV_FILES[0].rowCount as number) * 2} rows`,
                { exact: true },
              ),
          ).toBeVisible();
        });

        test("Cannot append a CSV file to a table with a different schema", async ({
          page,
        }) => {
          await uploadFileToCollection(page, collectionId, VALID_CSV_FILES[0]);
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();

          await uploadToExisting(page, {
            testFile: VALID_CSV_FILES[1],
            identicalSchema: false,
            uploadMode: "append",
          });
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();
        });
      });

      test.describe("CSV replacement", () => {
        test("Can replace data in an existing table", async ({ page }) => {
          await uploadFileToCollection(page, collectionId, VALID_CSV_FILES[0]);
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();

          await uploadToExisting(page, {
            testFile: VALID_CSV_FILES[0],
            uploadMode: "replace",
          });
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();
        });

        test("Cannot data in a table with a different schema", async ({
          page,
        }) => {
          await uploadFileToCollection(page, collectionId, VALID_CSV_FILES[0]);
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();

          await uploadToExisting(page, {
            testFile: VALID_CSV_FILES[1],
            identicalSchema: false,
            uploadMode: "replace",
          });
          await expect(
            page
              .getByTestId("view-footer")
              .getByText(`Showing ${VALID_CSV_FILES[0].rowCount} rows`, {
                exact: true,
              }),
          ).toBeVisible();
        });
      });
    });
  }

  test("should allow you to choose a model to append to if there are multiple (metabase#53824)", async ({
    mb,
    page,
  }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.updateSetting("anon-tracking-enabled", true);

    await enableUploads(mb.api, "postgres");

    // headlessUpload runs its multipart POST inside the page, so the page has
    // to be on the app origin first (upstream's cy.request inherits the
    // browser's cookie jar without navigating).
    await page.goto("/");
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[0]);
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[1]);

    // Port of H.visitCollection.
    await page.goto(`/collection/${FIRST_COLLECTION_ID}`);

    await page
      .locator("#upload-input")
      .setInputFiles(fixturePayload(VALID_CSV_FILES[2]));

    await page.getByRole("radio", { name: /Append to a model/ }).click();

    const modelSelect = page.getByRole("textbox", {
      name: "Select a model",
      exact: true,
    });
    // Upstream: `should("contain.value", …)` — a SUBSTRING check on the value.
    await expect(modelSelect).toHaveValue(
      new RegExp(VALID_CSV_FILES[1].humanName as string),
    );
    await modelSelect.click();

    await popover(page)
      .getByText(VALID_CSV_FILES[0].humanName as string, { exact: true })
      .click();
    // Upstream: `should("have.value", …)` — an EXACT value check.
    await expect(modelSelect).toHaveValue(
      VALID_CSV_FILES[0].humanName as string,
    );
    await modelSelect.click();
  });

  test.afterAll(async () => {
    if (!process.env.PW_QA_DB_ENABLED) {
      return;
    }
    // Restore the shared containers. Upstream leaves every uploaded table
    // behind; four other slots share this instance (FINDINGS #85).
    const pg = await dropUploadTables("postgres", {
      database: "writable_db",
      schema: "public",
    });
    const pgEmpty = await dropUploadTables("postgres", {
      database: "writable_db",
      schema: "empty_uploads",
    });
    const my = await dropUploadTables("mysql", {
      database: "writable_db",
      schema: "writable_db",
    });
    // `empty_uploads` is created by this spec's first test, so dropping it is
    // restoring — no FOREIGN schema is touched.
    await queryQaDB(
      "DROP SCHEMA IF EXISTS empty_uploads CASCADE;",
      "postgres",
      "writable_db",
    );
    console.log(
      `[collections-uploads] cleanup: dropped ${pg.length} table(s) from ` +
        `writable_db.public, ${pgEmpty.length} from writable_db.empty_uploads, ` +
        `${my.length} from mysql writable_db, plus schema empty_uploads`,
    );
  });
});

test.describe("permissions", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires the pro-self-hosted token (H.activateToken)",
  );

  test("should not show you upload buttons if you are a sandboxed user", async ({
    mb,
    page,
  }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await mb.api.activateToken("pro-self-hosted");
    await enableUploads(mb.api, "postgres");

    //Deny access for all users to writable DB
    await updatePermissionsGraph(mb.api, {
      1: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
    });

    const tablesResponse = await mb.api.get(
      `/api/database/${WRITABLE_DB_ID}/schema/public`,
    );
    const tables = (await tablesResponse.json()) as { id: number }[];
    const fieldsResponse = await mb.api.get(
      `/api/database/${WRITABLE_DB_ID}/fields`,
    );
    const fields = (await fieldsResponse.json()) as { id: number }[];

    // Sandbox a table so that the sandboxed user will have read access to a table
    await sandboxTable(mb.api, {
      table_id: tables[0].id,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", fields[0].id, null]],
      },
    });

    await mb.signInAsSandboxedUser();
    await page.goto("/collection/root");
    // No upload icon should appear for the sandboxed user
    const collectionMenu = page.getByTestId("collection-menu");
    // The calendar icon is the anchor that proves the menu rendered at all —
    // without it the absence check below would be satisfied by an unpainted
    // page (PORTING #73).
    await expect(collectionMenu.locator(".Icon-calendar")).toHaveCount(1);
    await expect(
      collectionMenu.getByLabel("Upload data", { exact: true }),
    ).toHaveCount(0);
  });

  test("should show you upload buttons if you have unrestricted access to the upload schema", async ({
    mb,
    page,
  }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await mb.api.activateToken("pro-self-hosted");
    await enableUploads(mb.api, "postgres");

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
      [NOSQL_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });

    await updateCollectionGraph(mb.api, {
      [NOSQL_GROUP]: { root: "write" },
    });

    await mb.signIn("nosql" as Parameters<typeof mb.signIn>[0]);
    await page.goto("/collection/root");
    const collectionMenu = page.getByTestId("collection-menu");
    await expect(
      collectionMenu.getByLabel("Upload data", { exact: true }),
    ).toHaveCount(1);
    await expect(
      collectionMenu.getByRole("img", { name: /upload/i }),
    ).toHaveCount(1);
  });
});

test.describe("Upload Table Cleanup/Management", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires the pro-self-hosted token (H.activateToken)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await enableUploads(mb.api, "postgres");
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow a user to delete an upload table", async ({
    mb,
    page,
  }) => {
    await page.goto("/");
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[0]);
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[0]);
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[0]);

    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[1]);
    await headlessUpload(page, FIRST_COLLECTION_ID, VALID_CSV_FILES[1]);

    const uploadTablesLoaded = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname ===
            "/api/ee/upload-management/tables",
      );

    let loaded = uploadTablesLoaded();
    await page.goto("/admin/settings/uploads");
    await loaded;

    const uploadTables = page.getByTestId("upload-tables-table");
    await expect(uploadTables.getByText(/dog_breeds/i)).toHaveCount(3);
    await expect(uploadTables.getByText(/star_wars_characters/i)).toHaveCount(2);

    // single delete
    loaded = uploadTablesLoaded();
    await uploadTables.getByLabel("trash icon").first().click();

    await modal(page).getByRole("button", { name: "Delete", exact: true }).click();
    await loaded;

    await expect(
      page.getByTestId("undo-list").getByText(/1 table deleted/i),
    ).toBeVisible();

    await expect(uploadTables.getByText(/dog_breeds/i)).toHaveCount(2);
    await expect(uploadTables.getByText(/star_wars_characters/i)).toHaveCount(2);

    // multiple delete
    await uploadTables.getByRole("checkbox").first().click();
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await uploadTables.getByRole("checkbox").last().click();

    loaded = uploadTablesLoaded();
    await page
      .getByTestId("toast-card")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await modal(page).getByRole("button", { name: "Delete", exact: true }).click();
    await loaded;

    await expect(
      page.getByTestId("undo-list").getByText(/2 tables deleted/i),
    ).toBeVisible();

    await expect(uploadTables.getByText(/dog_breeds/i)).toHaveCount(1);
    await expect(uploadTables.getByText(/star_wars_characters/i)).toHaveCount(1);
  });

  test.afterAll(async () => {
    if (!process.env.PW_QA_DB_ENABLED) {
      return;
    }
    // This describe and the `permissions` one point uploads at db 2 under the
    // `postgres-12` snapshot, which is the READ-ONLY QA `sample` database —
    // so the tables land there, not in writable_db. Upstream leaves them.
    const dropped = await dropUploadTables("postgres", {
      database: "sample",
      schema: "public",
    });
    console.log(
      `[collections-uploads] cleanup: dropped ${dropped.length} upload table(s) ` +
        `from the QA sample database`,
    );
  });
});
