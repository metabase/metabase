/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/transforms-incremental.cy.spec.ts
 * (414 lines, 3 tests in one `creation` describe). Every upstream `it` has a
 * counterpart here, in upstream order, with nothing dropped or merged.
 *
 * ======================== TOKEN TIER — SPLITS IN TWO ========================
 * The gating for this file is NOT uniform, and the sibling transforms-inspect
 * conclusion ("nothing is token-blocked") does NOT transfer. It splits by
 * transform source type:
 *
 *   MBQL + native SQL -> query-transforms-enabled?  (token_check.clj:715)
 *                        short-circuits on (not is-hosted?) -> RUNS.
 *   python            -> python-transforms-enabled? (token_check.clj:724)
 *                        requires :transforms-basic with NO short-circuit,
 *                        and that feature is absent here -> 402.
 *
 * Probed live on :4103, not inferred: the incremental MBQL create+run returns
 * 200/202 with `checkpoint_hi_value: 30`, while a python create returns
 * **402 "Premium features required for this transform type are not enabled."**
 * localstack :4566 (the python runner's S3 dependency) is also down. The python
 * test is `test.fixme` on both, and upstream tags it `@python` besides.
 * Full derivation + probe transcript: support/transforms-incremental.ts.
 * ===========================================================================
 *
 * QA-DATABASE TIER. Gated on PW_QA_DB_ENABLED; the two query tests EXECUTE when
 * the gate is on (a green all-skipped run is the failure mode — FINDINGS #49).
 * Upstream carries NO `@external` tag here even though it drives the writable
 * container exactly as its tagged siblings do — the tag is missing, not
 * absent-by-design.
 *
 * SNOWPLOW VANTAGE — browser boundary (`installSnowplowCapture`), deliberately.
 * Both asserted events are FE-emitted `trackSimpleEvent` calls in
 * frontend/src/metabase/transforms/analytics.ts (`transform_create` at :41,
 * `transform_trigger_manual_run` at :19) — grepped across `frontend/src` AND
 * `enterprise/frontend`, with no `track-event!` call site in `src/`. They never
 * reach the JVM, so the per-slot collector (support/snowplow-collector.ts) is
 * the wrong seam; it exists for backend-emitted events. It would also be
 * self-defeating: `installSnowplowCapture`'s `page.route` fulfils the tracker
 * POST before it leaves the browser, so the collector could never see it.
 * The two vantages are mutually exclusive for FE events, not complementary.
 *
 * This is NOT dead snowplow setup: upstream calls `H.resetSnowplow()` in the
 * beforeEach AND makes six real `expectUnstructuredSnowplowEvent` assertions
 * (two per test), so the machinery is load-bearing and was built rather than
 * stubbed. Checked before building it.
 *
 * KNOWN GAP, stated rather than papered over: `H.expectNoBadSnowplowEvents`
 * upstream asks snowplow-micro for Iglu SCHEMA-VALIDATION failures. The
 * browser-boundary port degrades it to a structural check (every payload
 * decoded into a well-formed self-describing event), exactly as the sibling
 * transforms-inspect and transforms ports do. Closing it needs
 * `SnowplowCapture` to retain the schema URI, which means editing a shared
 * support module — not permitted here. Flagged as a consolidation candidate.
 *
 * Port notes:
 * - The beforeEach registers NINE `cy.intercept(...).as(...)` aliases. Only
 *   `@createTransform` and `@resetCheckpoint` are ever awaited; the other seven
 *   (`@updateField`, `@updateTransform`, `@deleteTransform`,
 *   `@deleteTransformTable`, `@createTag`, `@updateTag`, `@deleteTag`) are
 *   never waited on anywhere in the file and are dropped (PORTING rule 2).
 * - `cy.wait("@createTransform").then(...)` wraps the new id as `@transformId`.
 *   That alias is never read — in any of the three tests. The WAIT is kept
 *   (it gates the subsequent navigation on the POST landing); the dead
 *   id-capture is dropped, noted here rather than silently.
 * - `H.NativeEditor.type(sql, { allowFastSet: true })` does NOT type: upstream
 *   writes `.cm-content`'s textContent directly, then types " {backspace}" to
 *   make CodeMirror re-run its validator. Ported via the existing
 *   `fastSetNativeEditor`, which reproduces that verbatim. This is the reason
 *   the `{{t}}` template tag is safe here — no keystrokes means no
 *   close-brackets and no autocomplete `interactionDelay` hazard.
 * - Mantine Switch ("Only process new data"): click the visually-hidden
 *   `role="switch"` input with `{ force: true }` (PORTING rule 4), the
 *   established pattern in admin-permissions.ts / multi-factor-auth.ts.
 * - `should("have.value", x)` -> `toHaveValue(x)`; `should("exist")` ->
 *   `toHaveCount(1)` (presence, retried — NOT upgraded to toBeVisible).
 * - `findByRole` (singular) vs `findAllByRole(...).first()` is upstream's own
 *   distinction between "exactly one run row" and "the newest of several";
 *   preserved rather than normalized. See openRunDetail.
 */
import { expect, test } from "../support/fixtures";
import {
  blurNativeEditor,
  fastSetNativeEditor,
} from "../support/native-reproductions";
import { miniPicker } from "../support/notebook";
import {
  WRITABLE_DB_ID,
  queryWritableDB,
  resyncDatabase,
} from "../support/schema-viewer";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { DataStudio } from "../support/transforms";
import { resetManySchemasTable } from "../support/transforms-codegen";
import {
  DB_NAME,
  PYTHON_SKIP_REASON,
  QA_DB_SKIP_REASON,
  SCHEMA_B,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  TARGET_TABLE,
  editorSidebar,
  expectCheckpointTo,
  getQueryEditor,
  openRunDetail,
  removeAppendedSourceRows,
  resetCheckpointFromSettings,
  resetIncrementalTargetTables,
  runTransformAndWaitForSuccess,
  visitTransformListPage,
} from "../support/transforms-incremental";
import { modal, popover } from "../support/ui";

test.describe("scenarios > admin > transforms incremental", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // No counterpart upstream — the target table's "already exists" guard is a
    // PHYSICAL warehouse check that the app-DB restore cannot clear, and this
    // container is long-lived and shared. See the helper's docstring.
    await resetIncrementalTargetTables();

    // H.resetSnowplow() + H.enableTracking(): the capture is fresh per test, so
    // installing it IS the reset. Must precede the first navigation — the
    // tracker is created during app bootstrap.
    capture = await installSnowplowCapture(page, mb.baseUrl);

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    // `tables` (not the bare form) is deliberate: resetManySchemasTable just
    // recreated Animals, and a stale `initial_sync_status: "complete"` row
    // would satisfy the bare wait instantly.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test.afterEach(async () => {
    // Restore the rows the test appended, so the shared container's table
    // inventory is unchanged by this spec.
    if (process.env.PW_QA_DB_ENABLED) {
      await removeAppendedSourceRows();
      await resetIncrementalTargetTables();
    }
    // afterEach still runs when the beforeEach gate skipped the test, and the
    // capture was never installed.
    if (!capture) {
      return;
    }
    expectNoBadSnowplowEvents(capture);
  });

  test.describe("creation", () => {
    test("should be able to create and run an mbql incremental transform", async ({
      page,
    }) => {
      // Four real warehouse round trips plus a full notebook build; the 90s
      // project default is not enough headroom.
      test.setTimeout(240_000);

      // create a new transform
      await visitTransformListPage(page);
      await page
        .getByRole("button", { name: "Create a transform", exact: true })
        .click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_create",
        event_detail: "query",
      });

      const picker = miniPicker(page);
      await picker.getByText(DB_NAME, { exact: true }).click();
      await picker.getByText(TARGET_SCHEMA, { exact: true }).click();
      await picker.getByText(SOURCE_TABLE, { exact: true }).click();
      await getQueryEditor(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();

      const saveModal = modal(page);
      await saveModal.getByLabel("Name", { exact: true }).fill("MBQL");

      // should auto-populate table name based on transform name...
      await expect(
        saveModal.getByLabel("Table name", { exact: true }),
      ).toHaveValue("mbql");
      await saveModal
        .getByLabel("Table name", { exact: true })
        .fill(TARGET_TABLE);

      // ...unless user has manually modified the table name.
      //
      // Cypress's `.type()` APPENDS at the end of the existing value. After a
      // Playwright `fill()` the caret sits at index 0, so a bare
      // `pressSequentially` prepends — measured: the transform was created as
      // " transformMBQL" instead of "MBQL transform", and the run-list row
      // regex then never matched. Move the caret to the end first.
      const nameInput = saveModal.getByLabel("Name", { exact: true });
      await nameInput.click();
      await nameInput.press("End");
      await nameInput.pressSequentially(" transform");
      await expect(
        saveModal.getByLabel("Table name", { exact: true }),
      ).toHaveValue(TARGET_TABLE);
      await saveModal
        .getByRole("switch", { name: /Only process new data/i })
        .click({ force: true });

      // The one alias that gates what follows; the `@transformId` capture
      // upstream builds from this response is never read (see header).
      const createTransform = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/transform" &&
          response.request().method() === "POST",
      );
      await saveModal.getByRole("button", { name: "Save", exact: true }).click();
      await createTransform;

      // run the transform and make sure its table can be queried
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_trigger_manual_run",
      });

      await openRunDetail(page, /MBQL transform/i);
      await expectCheckpointTo(page, /30/);

      // add one element to the source table and run incremental transform again
      await queryWritableDB(
        `INSERT INTO "${TARGET_SCHEMA}"."Animals" (name, score) VALUES ('NewRow', 31)`,
      );

      await page.goBack();
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);

      // verify the new element was picked up in the incremental transfer
      await openRunDetail(page, /MBQL transform/i, { first: true });
      await expectCheckpointTo(page, /31/);

      // go to Transform Settings and reset checkpoint
      await page.goBack();
      await resetCheckpointFromSettings(page, /31/);

      // go to Runs tab, run transform again and check new run has checkpoint to 31
      //
      // ⚠️ WEAK UPSTREAM ASSERTION — recorded verbatim, NOT strengthened
      // (faithfulness rule). This block cannot detect a broken
      // reset-checkpoint. Mutation-tested: stubbing POST
      // /api/transform/:id/reset-checkpoint to a local 204 (so the request
      // fires and the wait resolves, but the backend never resets) leaves this
      // test GREEN. The assertion is live, not vacuous — re-running the same
      // stub against /99/ fails — the two states simply coincide.
      //
      // Why, measured via the API: `checkpoint_hi_value` (which is what
      // "Checkpoint to" renders) is 30 for the initial run, 30 for a re-run
      // with no reset, and 30 again after a reset. The field that actually
      // discriminates is `checkpoint_lo_value` — null after a reset, the prior
      // watermark otherwise — and InfoSection.tsx:50 renders its "Checkpoint
      // from" row ONLY when it is non-null.
      //
      // A follow-up that would kill the mutant, for whoever owns the upstream
      // spec: assert the "Checkpoint from" group is ABSENT here (it is present
      // on the immediately preceding, un-reset run).
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);
      await openRunDetail(page, /MBQL transform/i, { first: true });
      await expectCheckpointTo(page, /31/);
    });

    // UPSTREAM TAG: { tags: ["@python"] }.
    //
    // Blocked twice over on this box, both probed rather than assumed:
    //   1. TOKEN. `python-transforms-enabled?` (token_check.clj:724) requires
    //      `:transforms-basic` with no short-circuit, and the local
    //      pro-self-hosted token lacks it. POST /api/transform with a python
    //      source returns 402 "Premium features required for this transform
    //      type are not enabled." This fires first, at create.
    //   2. INFRA. localstack :4566 — the python runner's S3 dependency — is
    //      not running (`curl` probe).
    //
    // This is the one place where the sibling transforms-inspect finding
    // ("transforms-basic gates nothing here") genuinely does not transfer:
    // that spec had no python transform, so it never reached this predicate.
    // A token refresh alone would NOT recover this test — localstack would
    // still be down.
    // Title kept verbatim for traceability; the reason lives in the comment
    // above and in PYTHON_SKIP_REASON (support/transforms-incremental.ts).
    test.fixme(
      "should be able to create and run a Python incremental transform",
      async () => {
        // Body intentionally unported: it cannot run on this box (see above),
        // so a ported-but-never-executed body would be indistinguishable from
        // a passing test and would rot silently against the real surface.
        //
        // Reason (also exported as PYTHON_SKIP_REASON):
        void PYTHON_SKIP_REASON;
      },
    );

    test("should be able to create and run a native SQL incremental transform", async ({
      page,
    }) => {
      test.setTimeout(240_000);

      // create a new transform
      await visitTransformListPage(page);
      await page
        .getByRole("button", { name: "Create a transform", exact: true })
        .click();
      await popover(page).getByText("SQL query", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_create",
        event_detail: "native",
      });

      // The "SQL query" popover closes while the database popover opens, so
      // both are transiently visible and `popover()` (which matches ALL visible
      // popovers) can resolve the DB_NAME row inside the CLOSING one — it then
      // goes invisible and detaches mid-click, and every retry re-loses the
      // race. Measured: 30s of "element was detached from the DOM, retrying".
      // Settling on a single popover first is the fix (same guard as
      // admin-permissions.ts).
      // Upstream: `H.popover().findByText(DB_NAME).click()`.
      //
      // That click CANNOT be ported literally on this instance, and the reason
      // is measured rather than guessed. Exactly one database here is eligible
      // for transforms, so the app AUTO-SELECTS it: the database popover exists
      // at t=0 and is gone by t+200ms (probed — 0 popovers at t+200/800/2000ms,
      // with `native-query-top-bar` already showing DB_NAME). Playwright's
      // actionability checks lose that race every time; the literal port spent
      // 30s in "element was detached from the DOM, retrying".
      //
      // Ported as the STATE the click exists to establish, which is also
      // exactly what the rest of the test depends on: the editor is bound to
      // DB_NAME. This is not a weakening — if the popover ever stops
      // auto-resolving (e.g. a second eligible database appears), this fails
      // loudly instead of silently proceeding on the wrong database.
      //
      // NOT CROSS-CHECKED against Cypress: running the original would break
      // live sibling slots (standing rule), so I cannot say whether upstream
      // races this too or whether CI has a second eligible database that keeps
      // the popover open. Recorded as an environment-dependent divergence.
      await expect(
        page
          .getByTestId("native-query-top-bar")
          .getByText(DB_NAME, { exact: true }),
      ).toBeVisible();
      // allowFastSet: a direct textContent write, NOT keystrokes — which is
      // precisely how upstream dodges close-brackets/autocomplete on `{{t}}`.
      await fastSetNativeEditor(page, "SELECT * FROM {{t}}");
      await blurNativeEditor(page);

      // configure table variable for incremental support
      await page
        .getByTestId("native-query-top-bar")
        .getByLabel("Variables", { exact: true })
        .click();
      await editorSidebar(page)
        .getByLabel("Variable type", { exact: true })
        .click();
      await popover(page).getByText("Table", { exact: true }).click();
      await popover(page).getByText(SCHEMA_B, { exact: true }).click();
      await popover(page).getByText(SOURCE_TABLE, { exact: true }).click();

      await getQueryEditor(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();

      const saveModal = modal(page);
      await saveModal.getByLabel("Name", { exact: true }).fill("SQL transform");
      await saveModal
        .getByLabel("Table name", { exact: true })
        .fill(TARGET_TABLE);
      await saveModal
        .getByRole("switch", { name: /Only process new data/i })
        .click({ force: true });

      const createTransform = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/transform" &&
          response.request().method() === "POST",
      );
      await saveModal.getByRole("button", { name: "Save", exact: true }).click();
      await createTransform;

      // run the transform and make sure its table can be queried
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_trigger_manual_run",
      });

      await openRunDetail(page, /SQL transform/i);
      await expectCheckpointTo(page, /30/);

      // add one element to the source table and run incremental transform again
      await queryWritableDB(
        `INSERT INTO "${SCHEMA_B}"."Animals" (name, score) VALUES ('NewRow', 31)`,
      );

      await page.goBack();
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);

      // verify the new element was picked up in the incremental transfer
      await openRunDetail(page, /SQL transform/i, { first: true });
      await expectCheckpointTo(page, /31/);

      // go to Transform Settings and reset checkpoint
      await page.goBack();
      await resetCheckpointFromSettings(page, /31/);

      // go to Runs tab, run transform again and check new run has checkpoint to 31
      await DataStudio.Transforms.runTab(page).click();
      await runTransformAndWaitForSuccess(page);
      await openRunDetail(page, /SQL transform/i, { first: true });
      await expectCheckpointTo(page, /31/);
    });
  });
});
