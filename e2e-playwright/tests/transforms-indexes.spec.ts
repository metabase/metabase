/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/transforms-indexes.cy.spec.ts
 * (217 lines, 2 tests in one describe). Every upstream `it` has a counterpart
 * here, in upstream order, with nothing dropped, weakened or merged.
 *
 * TOKEN TIER: traced end-to-end and then controlled for. Short version — the
 * `/api/index/*` namespace has NO premium-feature check whatsoever, the
 * transform create's check short-circuits on `(not is-hosted?)`, and the
 * `:transformId/indexes` route + "Indexes" tab are registered unconditionally.
 * `activateToken` is kept for faithfulness but gates nothing here. Full
 * derivation in support/transforms-indexes.ts; the two-arm control that
 * confirms it is in findings-inbox/transforms-indexes.md.
 *
 * QA-DATABASE TIER. Gated on PW_QA_DB_ENABLED at DESCRIBE level (not in the
 * beforeEach) because this describe has an afterEach — a beforeEach-level
 * `test.skip` makes the afterEach report the tests as FAILED rather than
 * skipped. Both tests EXECUTE when the gate is on; a green all-skipped run is
 * the failure mode, not the goal.
 *
 * ==================== UPSTREAM ASSERTION WEAKNESSES, KEPT ===================
 * Ported verbatim with the analysis inline rather than silently strengthened.
 *
 * (a) LIST TEST, row 0 `.and("contain", "name")`. That substring is meant to
 *     prove the Columns cell reads "name". It cannot: the same row's Name cell
 *     already reads "idx_animal_name", which CONTAINS "name". The assertion is
 *     satisfiable with the Columns column entirely blank, and a mutation
 *     confirmed it (see MUTATION 3 in the findings). Row 1's
 *     `.and("contain", "score, name")` does NOT have this problem and is the
 *     real discriminator for the Columns column. Kept as-is.
 *
 * (b) LIFECYCLE TEST, `indexesContent().should("contain", "Indexes")`. The
 *     `transforms-indexes-content` container encloses the TransformHeader,
 *     whose tab strip contains a literal "Indexes" tab that renders on every
 *     transform page regardless of the indexes payload. The substring is
 *     therefore present before the index list has loaded at all. The companion
 *     `.and("contain", "Index the key columns of your transforms…")` is the
 *     load-bearing half. Kept as-is.
 *
 * (c) LIFECYCLE TEST, `.and("not.contain", "Never")` on the succeeded row.
 *     This is an absence assertion, but it is NOT of the unbounded /
 *     self-expiring kind the toast rule warns about: "Never" is the static
 *     rendering of `last_executed_at == null` in a table cell, with no timer
 *     and no exit transition. Checked the mechanism (columns.tsx `last-run`
 *     accessor); the warning is inapplicable here. Runtime was watched anyway.
 * ===========================================================================
 *
 * Port notes:
 * - `H.queryWritableDB` is ported through a LOCAL row-returning variant.
 *   `support/schema-viewer.ts`'s export is typed `Promise<void>` and throws the
 *   result set away, which cannot express the `pg_indexes` row-count assertion.
 * - `resetIndexesTargetTables()` has no upstream counterpart and is required:
 *   this harness's `restore()` does not reset the warehouse (Cypress's does),
 *   so the transform create would 403 on the second run. See the helper's
 *   docstring; it drops two exact table names in one schema and nothing else.
 * - `should("contain", x).and("contain", y)` on a single row is N separate
 *   substring checks against the same element, so it becomes N
 *   `toContainText()` calls — NOT `toContainText([x, y])`, which in Playwright
 *   means "N elements, one substring each" and would be a different assertion.
 * - `should("have.length", 2)` -> `toHaveCount(2)` (retried).
 * - The `label` order check compares against the BE-defined field order for
 *   postgres btree (`driver/postgres.clj:1344` -> name, unique, columns), with
 *   the Mantine "Index type" Select injected after the first field by
 *   `IndexEditorForm.tsx`. Ported as an exact array deep-equal, as upstream.
 */
import { expect, test } from "../support/fixtures";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  DataStudio,
  createMbqlTransform,
  runTransformAndWaitForSuccess,
} from "../support/transforms";
import { resetManySchemasTable } from "../support/transforms-codegen";
import {
  INDEX_TABLE_COLUMNS,
  LIFECYCLE_TARGET_TABLE,
  LIST_TARGET_TABLE,
  QA_DB_SKIP_REASON,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  btreeIndex,
  createIndexRequest,
  deleteIndexRequest,
  execWritableDB,
  indexesContent,
  indexesTab,
  indexesTable,
  matchHeaderName,
  queryWritableDBRows,
  resetIndexesTargetTables,
  undoToast,
  visitIndexes,
} from "../support/transforms-indexes";
import { modal } from "../support/ui";

test.describe("data-studio > transforms > indexes", () => {
  // DESCRIBE-level skip: this describe has an afterEach, and a beforeEach-level
  // skip would make every test report as failed instead of skipped.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // No upstream counterpart — Cypress's restore also rebuilds the warehouse;
    // ours does not, so the target tables must be cleared by hand or the
    // transform create 403s on the second run. See the helper's docstring.
    await resetIndexesTargetTables();

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    // `tables` (not the bare form): resetManySchemasTable just recreated
    // Animals, and a stale `initial_sync_status: "complete"` row would satisfy
    // the bare wait instantly.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test.afterEach(async () => {
    // Leave the shared, never-reset container's table inventory unchanged by
    // this spec. Exact names, one schema; no LIKE patterns, no foreign schemas.
    if (process.env.PW_QA_DB_ENABLED) {
      await resetIndexesTargetTables();
    }
  });

  test("lists managed index requests with pending and removing statuses and sorts by column", async ({
    page,
    mb,
  }) => {
    const transform = await createMbqlTransform(mb.api, {
      sourceTable: SOURCE_TABLE,
      targetTable: LIST_TARGET_TABLE,
      targetSchema: TARGET_SCHEMA,
      name: "Indexes list transform",
    });

    await createIndexRequest(
      mb.api,
      transform.id,
      btreeIndex("idx_animal_name", ["name"]),
    );
    const removed = await createIndexRequest(
      mb.api,
      transform.id,
      btreeIndex("idx_animal_score", ["score", "name"]),
    );
    await deleteIndexRequest(mb.api, removed.id);

    await visitIndexes(page, transform.id);

    await test.step("all column headers render", async () => {
      for (const header of INDEX_TABLE_COLUMNS) {
        await expect(
          indexesTable(page).getByRole("columnheader", {
            name: matchHeaderName(header),
          }),
        ).toBeVisible();
      }
    });

    await test.step("pending request row shows all cell values", async () => {
      await expect(indexesTable(page).getByRole("row")).toHaveCount(2);

      const pendingRow = indexesTable(page).getByRole("row").nth(0);
      await expect(pendingRow).toContainText("idx_animal_name");
      await expect(pendingRow).toContainText("B-Tree");
      // See header note (a): vacuous — "idx_animal_name" already contains it.
      await expect(pendingRow).toContainText("name");
      await expect(pendingRow).toContainText("Managed");
      await expect(pendingRow).toContainText("Pending");
      await expect(pendingRow).toContainText("Bobby Tables");
      await expect(pendingRow).toContainText("Never");
    });

    await test.step("deleted request row shows the Removing status", async () => {
      const removingRow = indexesTable(page).getByRole("row").nth(1);
      await expect(removingRow).toContainText("idx_animal_score");
      await expect(removingRow).toContainText("score, name");
      await expect(removingRow).toContainText("Removing");
    });

    await test.step("clicking the Name header toggles the sort direction", async () => {
      await indexesTable(page)
        .getByRole("columnheader", { name: matchHeaderName("Name") })
        .click();
      await expect(
        indexesTable(page).getByRole("columnheader", {
          name: matchHeaderName("Name"),
        }),
      ).toHaveAttribute("aria-sort", "descending");

      await expect(indexesTable(page).getByRole("row")).toHaveCount(2);
      await expect(indexesTable(page).getByRole("row").nth(0)).toContainText(
        "idx_animal_score",
      );
    });
  });

  test("shows a pending index becoming succeeded after a transform run and lists unmanaged warehouse indexes", async ({
    page,
    mb,
  }) => {
    // Three real warehouse round trips (two transform runs plus a direct
    // CREATE INDEX) on top of a snapshot restore and a resync; the 90s project
    // default is not enough headroom.
    test.setTimeout(240_000);

    const targetTable = LIFECYCLE_TARGET_TABLE;

    // run the transform once so the target table exists
    const transform = await createMbqlTransform(mb.api, {
      sourceTable: SOURCE_TABLE,
      targetTable,
      targetSchema: TARGET_SCHEMA,
      name: "Indexes lifecycle transform",
    });
    await runTransformAndWaitForSuccess(mb.api, transform.id);
    await visitIndexes(page, transform.id);

    await test.step("the empty state renders for a transform with no indexes", async () => {
      // See header note (b): the "Indexes" half is satisfied by the tab strip.
      await expect(indexesContent(page)).toContainText("Indexes");
      await expect(indexesContent(page)).toContainText(
        "Index the key columns of your transforms to make them faster and more efficient.",
      );
    });

    await test.step("create an index via the form", async () => {
      await indexesContent(page)
        .getByRole("button", { name: "Create index" })
        .click();
    });

    await test.step("form fields render in the backend-defined order, name first", async () => {
      // Deep-equal on the full label list, exactly as upstream. This is the
      // assertion that pins the BE-driven ordering, so it must stay an
      // ordered array comparison and not a set of presence checks.
      await expect
        .poll(() => modal(page).locator("label").allTextContents())
        .toEqual([
          "Give your index a name",
          "Index type",
          "Enforce uniqueness across rows for indexed columns.",
          "Columns",
        ]);
    });

    await modal(page)
      .getByLabel("Give your index a name")
      .fill("idx_lifecycle_name");
    await modal(page).getByPlaceholder("Select columns").click();
    await page.getByRole("option", { name: "Name" }).click();
    await modal(page).getByRole("button", { name: "Create index" }).click();
    // `{ exact: true }` is the FAITHFUL form, not a strengthening: Cypress's
    // `findByText("Index created")` is exact by default, whereas Playwright's
    // bare `getByText` is substring AND case-insensitive — i.e. broader than
    // upstream. The usual counter-risk (Playwright reads the full textContent
    // while testing-library reads only direct child text nodes, so `exact` can
    // be too NARROW) does not bite here: the toast renders its message in a
    // leaf element. Both forms were run against the real toast; both pass.
    await expect(
      undoToast(page).getByText("Index created", { exact: true }),
    ).toBeVisible();

    await test.step("the new index request starts out pending and never run", async () => {
      await expect(indexesTable(page).getByRole("row")).toHaveCount(1);
      const row = indexesTable(page).getByRole("row").nth(0);
      await expect(row).toContainText("idx_lifecycle_name");
      await expect(row).toContainText("Managed");
      await expect(row).toContainText("Pending");
      await expect(row).toContainText("Never");
    });

    await test.step("run the transform from the run tab", async () => {
      await DataStudio.Transforms.runTab(page).click();
      await DataStudio.Transforms.runButton(page).click();
      // `should("have.text", …)` is full-string equality, not a substring.
      await expect(DataStudio.Transforms.runButton(page)).toHaveText(
        "Ran successfully",
        { timeout: 120_000 },
      );
    });

    await test.step("simulate a DBA-created index directly in the warehouse", async () => {
      await execWritableDB(
        `CREATE INDEX dba_made ON "${TARGET_SCHEMA}"."${targetTable}" (score)`,
      );
    });

    await test.step("the applied index request shows Succeeded and a last run date", async () => {
      await indexesTab(page).click();
      await expect(indexesTable(page).getByRole("row")).toHaveCount(2);

      const managedRow = indexesTable(page).getByRole("row").nth(1);
      await expect(managedRow).toContainText("idx_lifecycle_name");
      await expect(managedRow).toContainText("Managed");
      await expect(managedRow).toContainText("Succeeded");
      // Static cell text, no timer — see header note (c).
      await expect(managedRow).not.toContainText("Never");
    });

    await test.step("the managed index physically exists in the warehouse", async () => {
      const rows = await queryWritableDBRows(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = '${TARGET_SCHEMA}'
           AND tablename = '${targetTable}'
           AND indexname = 'idx_lifecycle_name'`,
      );
      expect(rows).toHaveLength(1);
    });

    await test.step("the DBA-created index is listed as unmanaged with no status", async () => {
      const unmanagedRow = indexesTable(page).getByRole("row").nth(0);
      await expect(unmanagedRow).toContainText("dba_made");
      await expect(unmanagedRow).toContainText("score");
      await expect(unmanagedRow).toContainText("Unmanaged");
      // EMPTY_CELL_PLACEHOLDER — an em dash (U+2014), not a hyphen.
      await expect(unmanagedRow).toContainText("—");
    });
  });
});
