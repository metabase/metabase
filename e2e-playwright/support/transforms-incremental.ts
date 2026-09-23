/**
 * Helpers for the transforms-incremental spec port
 * (e2e/test/scenarios/data-studio/transforms/transforms-incremental.cy.spec.ts).
 *
 * INCREMENTAL transforms: a transform whose target is `table-incremental` and
 * whose source carries a `checkpoint` strategy pinned to a numeric/temporal
 * "checkpoint filter field". Each run records a watermark
 * (`TransformRun.checkpoint_hi_value`) and the next run only processes rows
 * beyond it. The UI surfaces that watermark as the "Checkpoint to" group in the
 * run-detail "Info" region, and as "Last processed" on the Settings tab.
 *
 * ============================ TOKEN TIER — TRACED ============================
 * The queue tags this spec `token`. The gating is NOT uniform across this
 * file — it splits by transform SOURCE TYPE, and the two branches land on
 * opposite sides. Both were traced in the source and then probed live on :4103.
 *
 * `transforms/util.clj` `check-feature-enabled!` dispatches on source type:
 *
 *   query (MBQL + native SQL) -> premium-features/query-transforms-enabled?
 *     (token_check.clj:715)
 *       (and (setting/get :transforms-enabled)
 *            (or (not (is-hosted?)) (has-feature? :transforms-basic)))
 *
 *   python                    -> premium-features/python-transforms-enabled?
 *     (token_check.clj:724)
 *       (and (setting/get :transforms-enabled)
 *            (has-feature? :transforms-basic)
 *            (has-feature? :transforms-python))
 *
 * Measured on :4103 with `pro-self-hosted` activated: 42 features on,
 * `transforms-basic: FALSE`, `transforms-python: true`, `is-hosted?: false`.
 *
 *  - MBQL and SQL: the `or` short-circuits on `(not is-hosted?)`, so the
 *    missing `transforms-basic` is never consulted. Probed end-to-end —
 *    POST /api/transform (table-incremental target + checkpoint source) -> 200,
 *    POST /api/transform/:id/run -> 202, run status `succeeded`, and
 *    **`checkpoint_hi_value: 30`**, which is exactly the watermark the spec's
 *    first assertion (`/30/`) expects. reset-checkpoint -> 204.
 *
 *  - PYTHON: `python-transforms-enabled?` has NO short-circuit — it requires
 *    `transforms-basic` unconditionally, and that feature is genuinely absent.
 *    Probed: POST /api/transform with a python source ->
 *    **402 "Premium features required for this transform type are not enabled."**
 *    This is a REAL block, and it is a different answer from the sibling
 *    `transforms-inspect` port (which had no python transform and correctly
 *    concluded "nothing is token-blocked"). That conclusion does not transfer.
 *
 * Both blockers are now RESOLVED, so the python test is ported and passes (it
 * was `test.fixme`):
 *  - The 402 is a LOCAL-TOKEN gap, not a product block. In CI the pro-self-hosted
 *    secret is a staging token carrying `:transforms-basic`, so CREATE returns
 *    200. Locally the test goes through `activatePythonTransformToken`
 *    (support/transforms.ts), which keeps the spec on pro-self-hosted and only
 *    falls back to the all-features token when `transforms-basic` is absent.
 *  - localstack :4566 + the python-runner :5001 are up and verified, so the run
 *    completes end-to-end. Gated on PW_PYTHON_RUNNER_ENABLED (upstream `@python`).
 *
 * Note there is NO incremental-specific premium feature: grepping the backend
 * for an `incremental`-flavoured feature check returns nothing. Incrementality
 * is gated only via the source type above.
 * =============================================================================
 *
 * QA-DATABASE TIER. Restores `postgres-writable`, resets `many_schemas`, drives
 * WRITABLE_DB_ID (writable postgres on :5404). Gated on PW_QA_DB_ENABLED, and
 * this port EXECUTES when the gate is on — a green run with everything skipped
 * is the failure mode, not the goal (FINDINGS #49).
 *
 * NB: unlike its siblings `transforms.cy.spec.ts` and `transforms-indexes.cy.spec.ts`,
 * this file carries NO `@external` tag upstream despite depending on the QA
 * container just as hard. The tag is missing, not absent-by-design.
 *
 * New module (PORTING rule 9), named to match the spec basename exactly.
 * Shared support modules are imported read-only and never edited.
 */
import { type Page, expect } from "@playwright/test";

import { queryWritableDB } from "./schema-viewer";
import { DataStudio } from "./transforms";
import { modal } from "./ui";

// ---------------------------------------------------------------------------
// Constants (from the spec header)
// ---------------------------------------------------------------------------

export const DB_NAME = "Writable Postgres12";
export const SOURCE_TABLE = "Animals";
export const TARGET_SCHEMA = "Schema A";
export const SCHEMA_B = "Schema B";

/**
 * ⚠️ DELIBERATE DEVIATION FROM UPSTREAM, declared rather than smuggled.
 *
 * Upstream uses `TARGET_TABLE = "transform_table"`. That literal is UNSAFE in
 * this harness, and not for a stylistic reason: the already-landed sibling
 * `support/transforms.ts` `resetTransformTargetTables()` runs
 *
 *     ... WHERE table_schema IN ('Schema A','Schema B','Domestic','Wild','public')
 *           AND lower(table_name) LIKE '%transform%'  -> DROP TABLE CASCADE
 *
 * against the SAME long-lived writable container that all five slots share. A
 * concurrent `transforms.spec.ts` run on another slot would drop this spec's
 * target table mid-test. Renaming to anything still containing "transform"
 * (e.g. `incremental_transform_table`) does NOT escape that LIKE pattern, so
 * the name deliberately omits the substring.
 *
 * Nothing is weakened by this: the table name is never the SUBJECT of an
 * assertion. It is typed into the "Table name" field and read back
 * (`should("have.value", TARGET_TABLE)`) purely to prove the field stops
 * auto-tracking the transform name once manually edited — a self-referential
 * check that holds for any value. The auto-population assertion that DOES
 * depend on a literal (`"mbql"`, derived from the name "MBQL") is untouched.
 *
 * CI is unaffected either way: it provisions the writable container per job.
 */
export const TARGET_TABLE = "incr_target_table";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

/** See the token-tier block above — both halves probed, neither assumed. */
export const PYTHON_SKIP_REASON =
  "Needs the python-runner (:5001) + localstack S3 (:4566) that " +
  "H.setPythonRunnerSettings points at (set PW_PYTHON_RUNNER_ENABLED). Python " +
  "transform CREATE also needs :transforms-basic, absent from the local " +
  "pro-self-hosted token — handled by activatePythonTransformToken, which keeps " +
  "CI on pro-self-hosted and falls back to the all-features token locally.";

// ---------------------------------------------------------------------------
// Warehouse fixtures
// ---------------------------------------------------------------------------

/**
 * Drop the physical table this spec's transforms write into.
 *
 * No counterpart in the Cypress original, and the same reasoning as
 * `resetTransformTargetTables` in transforms.ts: the transform's
 * "table already exists" guard is a PHYSICAL check against the warehouse, and
 * the app-DB snapshot restore in the beforeEach cannot touch it. Upstream
 * tolerates the residue because CI provisions the writable container fresh per
 * job; the local container is long-lived and shared across sessions and agents.
 *
 * MEASURED, not assumed: the save modal exposes no target-schema control and
 * the spec never picks one, so the app defaults it — and it does NOT default to
 * the source schema. A first run put the table in **`Domestic`**, while this
 * helper was dropping only `Schema A`/`Schema B`; the next run's create then
 * failed with `403 "A table with that name already exists."` So the sweep is
 * keyed on the TABLE NAME across every schema rather than on a guessed schema.
 *
 * That is still narrow, because `TARGET_TABLE` is unique to this spec (see its
 * declaration above — the name was chosen to collide with nothing). It must NOT
 * drop foreign schemas or sibling slots' tables (#85: siblings live in the same
 * container), and it does not: it matches one exact table name and never drops
 * a schema.
 */
export async function resetIncrementalTargetTables() {
  await queryWritableDB(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_name = '${TARGET_TABLE}'
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
      END LOOP;
    END $$;
  `);
}

/**
 * Restore the source rows this spec mutates.
 *
 * Each test appends a `NewRow` to `<schema>."Animals"` to raise the watermark.
 * `H.resetTestTable({ table: "many_schemas" })` in the beforeEach already
 * recreates every `Animals` table from scratch, so this is belt-and-braces for
 * the AFTER-run container inventory rather than a correctness requirement.
 */
export async function removeAppendedSourceRows() {
  await queryWritableDB(
    [TARGET_SCHEMA, SCHEMA_B]
      .map((schema) => `DELETE FROM "${schema}"."Animals" WHERE name='NewRow';`)
      .join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Navigation / spec-local getters
// ---------------------------------------------------------------------------

/** Port of the spec-local visitTransformListPage(). */
export const visitTransformListPage = (page: Page) =>
  page.goto("/data-studio/transforms");

/** Port of the spec-local getQueryEditor(). */
export const getQueryEditor = (page: Page) =>
  page.getByTestId("transform-query-editor");

/** Port of the spec-local editorSidebar(). */
export const editorSidebar = (page: Page) => page.getByTestId("editor-sidebar");

/** Port of the spec-local getPythonDataPicker(). */
export const getPythonDataPicker = (page: Page) =>
  page.getByTestId("python-data-picker");

/**
 * Port of the spec-local getRunButton(): `findAllByTestId("run-button").eq(0)`.
 * Reuses the already-landed `DataStudio.Transforms.runButton`, which is the
 * same `.first()` semantics.
 */
export const getRunButton = (page: Page) => DataStudio.Transforms.runButton(page);

/**
 * Port of the spec-local runTransformAndWaitForSuccess():
 *   getRunButton().click();
 *   getRunButton().should("have.text", "Ran successfully");
 *
 * `have.text` is an exact (trimmed) match on the full text; `toHaveText` with a
 * string is the same exact match. It normalizes whitespace, which is a no-op
 * here — the subject is a single short label, never preformatted output.
 *
 * The default 10s expect timeout is not enough: this is a real warehouse round
 * trip, and each test performs four of them. Widened explicitly (upstream got
 * the same slack implicitly, via Cypress's per-command retry budget on a
 * button that only settles once the run finishes).
 */
export async function runTransformAndWaitForSuccess(page: Page) {
  await getRunButton(page).click();
  await expect(getRunButton(page)).toHaveText("Ran successfully", {
    timeout: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Run list / checkpoint assertions
// ---------------------------------------------------------------------------

/**
 * Port of:
 *   cy.findByRole("link", { name: "See all runs" }).click();
 *   cy.findByRole("treegrid", { name: "Transform runs" }).within(() => {
 *     cy.findByRole("row", { name: /X/i }).click();       // first === false
 *     cy.findAllByRole("row", { name: /X/i }).first().click();  // first === true
 *   });
 *
 * `findByRole` (singular) asserts exactly one match, which Playwright's strict
 * mode reproduces for free; `findAllByRole(...).first()` is an explicit
 * first-match once repeated runs have accumulated rows. The distinction is
 * upstream's and is preserved rather than normalized away.
 */
export async function openRunDetail(
  page: Page,
  name: RegExp,
  { first = false }: { first?: boolean } = {},
) {
  await page.getByRole("link", { name: "See all runs", exact: true }).click();

  const rows = page
    .getByRole("treegrid", { name: "Transform runs", exact: true })
    .getByRole("row", { name });

  await (first ? rows.first() : rows).click();
}

/**
 * Port of:
 *   cy.findByRole("region", { name: "Info" }).within(() => {
 *     cy.findByRole("group", { name: "Checkpoint to" }).within(() => {
 *       cy.findByText(/N/).should("be.visible");
 *     });
 *   });
 *
 * The watermark is `TransformRun.checkpoint_hi_value` — verified by API probe
 * (a first run over Animals{10,20,30} reports `checkpoint_hi_value: 30`).
 */
export async function expectCheckpointTo(page: Page, value: RegExp) {
  const group = page
    .getByRole("region", { name: "Info", exact: true })
    .getByRole("group", { name: "Checkpoint to", exact: true });

  await expect(group.getByText(value)).toBeVisible();
}

/**
 * Port of:
 *   H.DataStudio.Transforms.settingsTab().click();
 *   cy.findByRole("group", { name: /Last processed/i }).within(() => {
 *     cy.findByText(/N/).should("exist");
 *   });
 *   cy.button("Reprocess all data").click();
 *   H.modal().within(() => cy.button("Reprocess on next run").click());
 *   cy.wait("@resetCheckpoint");
 *
 * `should("exist")` is deliberately NOT upgraded to a visibility assertion —
 * see the note at the call site. The `@resetCheckpoint` wait is the one alias
 * in this file that genuinely gates a later step, so it is registered before
 * the click that triggers it (PORTING rule 2).
 */
export async function resetCheckpointFromSettings(page: Page, value: RegExp) {
  await DataStudio.Transforms.settingsTab(page).click();

  const lastProcessed = page.getByRole("group", { name: /Last processed/i });
  // Upstream is `should("exist")`, not `should("be.visible")`. Ported as
  // toHaveCount(1) — presence with retry, matching upstream's strength
  // exactly. Strengthening it to toBeVisible() would be a change, not a port.
  await expect(lastProcessed.getByText(value)).toHaveCount(1);

  const resetCheckpoint = page.waitForResponse(
    (response) =>
      /\/api\/transform\/\d+\/reset-checkpoint$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Reprocess all data", exact: true }).click();
  await modal(page)
    .getByRole("button", { name: "Reprocess on next run", exact: true })
    .click();

  await resetCheckpoint;
}
