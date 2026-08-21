/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/transforms-inspect.cy.spec.ts
 * (484 lines, 9 tests across 7 describes). Every upstream `it` has a
 * counterpart here, in upstream order, with nothing dropped or merged.
 *
 * ============================== TOKEN TIER ==============================
 * The queue tags this spec `token`, and the local `MB_PRO_SELF_HOSTED_TOKEN`
 * genuinely LACKS `transforms-basic` (measured against :4103 — 42 features on,
 * `transforms-basic: false`, `transforms-python: true`). The obvious inference
 * is that a transforms spec cannot run here. **That inference is wrong, and it
 * was checked before anything was written.**
 *
 * `query-transforms-enabled?` (token_check.clj:715) is
 *   `(and transforms-enabled (or (not is-hosted?) (has-feature? :transforms-basic)))`
 * and the slot backend reports `is-hosted? = false`, so the `or` never reaches
 * the feature check. Probed end-to-end: create → run (`succeeded`) →
 * `GET /api/ee/transforms/:id/inspect` → 200, `available_lenses:
 * [generic-summary, column-comparison]`. There is no 402 on this surface.
 *
 * So: nothing here is token-blocked, and there are **no `test.fixme`s**. All 9
 * tests execute. See support/transforms-inspect.ts for the full derivation and
 * findings-inbox/transforms-inspect.md for the probe transcript.
 * ========================================================================
 *
 * QA-DATABASE TIER. Upstream is `@external`: it restores the
 * `postgres-writable` snapshot, resets `many_schemas`, and drives
 * WRITABLE_DB_ID (the writable QA postgres on :5404). Gated on
 * PW_QA_DB_ENABLED — and this port EXECUTES when the gate is on. A green run
 * with everything skipped would be the failure mode, not the goal
 * (FINDINGS #49); the gate-OFF control is reported in the findings note.
 *
 * SNOWPLOW VANTAGE — browser boundary, deliberately.
 * All four events this spec asserts (`transform_inspect_lens_loaded`,
 * `transform_inspect_alert_clicked`, `transform_inspect_drill_lens_clicked`,
 * `transform_inspect_drill_lens_closed`) are FE-emitted `trackSimpleEvent`
 * calls in frontend/src/metabase/transforms/analytics.ts:103/120/135/149 —
 * verified by grep across both `frontend/src` and `enterprise/frontend`. They
 * never touch the JVM, so the per-slot collector (support/snowplow-collector.ts)
 * is the wrong seam: it exists for `track-event!` call sites in `src/`, and
 * `support/fixtures.ts:36` says as much ("FE-emitted events remain the province
 * of installSnowplowCapture; the two coexist"). Using the collector here would
 * also be self-defeating — `installSnowplowCapture`'s `page.route` intercepts
 * the tracker POST, so the collector would never receive it anyway.
 *
 * KNOWN GAP, stated rather than papered over: `H.expectNoBadSnowplowEvents`
 * upstream asks snowplow-micro for Iglu SCHEMA-VALIDATION failures. The
 * browser-boundary port degrades it to a structural check (every payload
 * decoded into a well-formed self-describing event). `support/iglu-validate.ts`
 * could close this, but it needs `{schema, data}` pairs and `SnowplowCapture`
 * discards the schema URI, keeping only `data.data` — closing the gap means
 * editing a shared support module, which this port is not permitted to do.
 * Flagged as a consolidation candidate in the findings note.
 *
 * Port notes:
 * - The two beforeEach `cy.intercept(...).as(...)` aliases become RESPONSE
 *   QUEUES (recordInspectorResponses / waitForInspectorDiscovery /
 *   waitForInspectorLens), not `waitForResponse` calls. This is load-bearing,
 *   not stylistic: `cy.wait("@alias")` pops PAST responses, and several tests
 *   here wait on `@inspectorLens` twice where the first wait is satisfied
 *   retroactively by a response fired during page load. A call-site
 *   `waitForResponse` would hang. See the helper's docstring.
 * - Cypress's glob `*` does not cross `/`, so `/inspect` and `/inspect/*` are
 *   disjoint aliases; the queue regexes preserve that.
 * - `should("not.exist")` → `toHaveCount(0)` (both retry; the faithful port).
 * - `cy.findAllByRole("treegrid").eq(n)` → `.nth(n)`; `.first()` → `.first()`.
 * - Row/cell text assertions use `toHaveText`, which normalizes whitespace.
 *   That is correct here — every asserted value is a short token ("Animals",
 *   "3", "0.00 %", "Integer"), never SQL or preformatted query output, so
 *   there is no formatting subject for normalization to erase.
 */
import { expect, test } from "../support/fixtures";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { resetManySchemasTable } from "../support/transforms-codegen";
import {
  QA_DB_SKIP_REASON,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  createAndRunMbqlJoinTransform,
  createAndRunMbqlTransform,
  createAndRunSqlTransform,
  createMbqlTransform,
  recordInspectorResponses,
  resetInspectTargetTables,
  resetNoPkTable,
  visitInspect,
  waitForInspectorDiscovery,
  waitForInspectorLens,
} from "../support/transforms-inspect";

test.describe("scenarios > data-studio > transforms > inspect", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // Not in the Cypress original — see resetInspectTargetTables' docstring.
    // The local writable container is long-lived and shared, so it carries
    // residue a per-job CI container would not.
    await resetInspectTargetTables();

    // The two cy.intercept aliases, and H.resetSnowplow() /
    // H.enableTracking() — the capture is fresh per test, so installing it IS
    // the reset. Both must be in place before the first navigation.
    recordInspectorResponses(page);
    capture = await installSnowplowCapture(page, mb.baseUrl);

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test.afterEach(async () => {
    // afterEach still runs when the beforeEach gate skipped the test, and the
    // capture was never installed (FINDINGS — found by a gate-OFF control).
    if (!capture) {
      return;
    }
    // H.expectNoBadSnowplowEvents() — structural stand-in; see the header.
    expectNoBadSnowplowEvents(capture);
  });

  test.describe("pre-run state", () => {
    test("should show alert when transform has not been run, then show inspect after running", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_prerun_table",
        targetSchema: TARGET_SCHEMA,
        name: "Pre-run inspect transform",
      });
      await visitInspect(page, transform.id);

      await expect(page.getByRole("alert")).toHaveText(
        "To inspect the transform you need to run it first.",
      );

      await page.getByTestId("run-button").first().click();

      await waitForInspectorDiscovery(page);

      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /1 input table/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /1 output table/i }),
      ).toBeVisible();

      await expect(page.getByRole("treegrid")).toHaveCount(4);
      await expect(
        page.getByRole("treegrid").first().getByText("Animals"),
      ).toBeVisible();
    });
  });

  test.describe("generic-summary lens", () => {
    test("should show Summary tab after running an MBQL transform", async ({
      page,
      mb,
    }) => {
      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_mbql_table",
        targetSchema: TARGET_SCHEMA,
        name: "MBQL inspect transform",
      });
      await visitInspect(page, transformId);

      await waitForInspectorDiscovery(page);

      await expect(page.getByRole("tab", { name: /Summary/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await expect(
        page.getByRole("heading", { name: /1 input table/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /1 output table/i }),
      ).toBeVisible();

      const tables = page.getByTestId("generic-summary-tables");
      {
        const row = tables.getByRole("treegrid").nth(0).getByRole("row");
        await expect(row.getByRole("gridcell").nth(0)).toHaveText("Animals");
        await expect(row.getByRole("gridcell").nth(1)).toHaveText("3");
        await expect(row.getByRole("gridcell").nth(2)).toHaveText("2");
      }
      {
        const row = tables.getByRole("treegrid").nth(1).getByRole("row");
        await expect(row.getByRole("gridcell").nth(0)).toHaveText(
          "inspect_mbql_table",
        );
        await expect(row.getByRole("gridcell").nth(1)).toHaveText("3");
        await expect(row.getByRole("gridcell").nth(2)).toHaveText("2");
      }

      const fields = page.getByTestId("generic-summary-fields");
      const fieldRows = fields.getByRole("treegrid").nth(0).getByRole("row");
      await expect(fieldRows).toHaveCount(3);
      await expect(fieldRows.nth(0)).toHaveText("Animals (2)");
      {
        const cells = fieldRows.nth(1).getByRole("gridcell");
        await expect(cells.nth(0)).toHaveText("Name");
        await expect(cells.nth(1)).toHaveText("Text");
        await expect(cells.nth(2)).toHaveText("3");
        await expect(cells.nth(3)).toHaveText("0.00 %");
      }
      {
        const cells = fieldRows.nth(2).getByRole("gridcell");
        await expect(cells.nth(0)).toHaveText("Score");
        await expect(cells.nth(1)).toHaveText("Integer");
        await expect(cells.nth(2)).toHaveText("3");
        await expect(cells.nth(3)).toHaveText("0.00 %");
      }

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_inspect_lens_loaded",
        event_detail: "generic-summary",
      });
    });
  });

  test.describe("join-analysis lens", () => {
    test("should show Join Analysis tab when transform has joins", async ({
      page,
      mb,
    }) => {
      await createAndRunMbqlJoinTransform(page, mb.api, {
        name: "Join MBQL inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_table",
      });

      await waitForInspectorDiscovery(page);

      await expect(page.getByRole("tab", { name: /Summary/ })).toBeVisible();
      await expect(
        page.getByRole("tab", { name: /Join Analysis/ }),
      ).toBeVisible();
    });

    test("should display join step data in tree table", async ({
      page,
      mb,
    }) => {
      await createAndRunMbqlJoinTransform(page, mb.api, {
        name: "Join tree inspect transform",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "inspect_join_tree_table",
      });

      const tabName = /Join Analysis/;

      await waitForInspectorDiscovery(page);
      await waitForInspectorLens(page);

      const tab = page.getByRole("tab", { name: tabName });
      await expect(tab.getByLabel(/clock icon/i)).toBeVisible();
      await tab.click();

      await waitForInspectorLens(page);

      await expect(tab.getByLabel(/clock icon/i)).toHaveCount(0);

      const treegrid = page.getByRole("treegrid");
      await expect(treegrid.getByText("Join")).toBeVisible();
      await expect(treegrid.getByText("Output")).toBeVisible();
      await expect(treegrid.getByText("Matched")).toBeVisible();
      await expect(treegrid.getByText("Table rows")).toBeVisible();

      await expect(page.getByRole("heading", { name: /1 join/i })).toBeVisible();
    });

    test("should show unmatched rows alert for left join with non-matching rows", async ({
      page,
      mb,
    }) => {
      await resetNoPkTable();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: ["no_pk_table"] });

      await createAndRunMbqlJoinTransform(page, mb.api, {
        name: "Left join unmatched transform",
        targetTable: "inspect_unmatched_table",
        sourceTable: "no_pk_table",
        sourceSchema: undefined,
        joinTable: SOURCE_TABLE,
        joinSchema: TARGET_SCHEMA,
        joinStrategy: "left-join",
      });

      await waitForInspectorDiscovery(page);
      await waitForInspectorLens(page);

      await page.getByRole("tab", { name: /Join Analysis/ }).click();

      await waitForInspectorLens(page);

      // Wait for trigger evaluation — drill button appears once card stats are
      // loaded (upstream's comment, and the reason this assertion precedes the
      // expand click rather than following it).
      await expect(
        page.getByRole("button", { name: /Unmatched rows in Animals - Name/i }),
      ).toBeVisible();

      // Expand the alert by clicking the warning icon in the first cell
      const treegrid = page.getByRole("treegrid");
      await treegrid.getByRole("gridcell").first().getByRole("button").click();
      await expect(
        treegrid.getByText(/Join 'Animals - Name' has >20% unmatched rows/),
      ).toBeVisible();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_inspect_alert_clicked",
      });
    });
  });

  test.describe("drill-down lenses", () => {
    test("loads unmatched-rows drill-down lens when triggered", async ({
      page,
      mb,
    }) => {
      await resetNoPkTable();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: ["no_pk_table"] });
      await createAndRunMbqlJoinTransform(page, mb.api, {
        name: "Left join unmatched transform",
        targetTable: "inspect_unmatched_table",
        sourceTable: "no_pk_table",
        sourceSchema: undefined,
        joinTable: SOURCE_TABLE,
        joinSchema: TARGET_SCHEMA,
        joinStrategy: "left-join",
      });

      await page.getByRole("tab", { name: /Join Analysis/ }).click();

      await page
        .getByRole("button", { name: /Unmatched rows in Animals - Name/ })
        .click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_inspect_drill_lens_clicked",
        triggered_from: "join_analysis",
      });

      const tabName = /Unmatched Rows/;

      await waitForInspectorLens(page);
      await page.getByRole("tab", { name: tabName }).click();

      await expect(
        page.getByRole("heading", { name: /Unmatched Row Samples/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: /Animals - Name: Rows with key but no match/,
        }),
      ).toBeVisible();

      await expect(
        page
          .getByTestId("visualization-root")
          .nth(0)
          .getByTestId("table-footer"),
      ).toHaveText("3 rows");

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_inspect_lens_loaded",
        event_detail: "unmatched-rows?join_step=1",
      });

      await page
        .getByRole("tab", { name: tabName })
        .getByRole("button", { name: /Close tab/i })
        .click();

      await expect(page.getByRole("link", { name: tabName })).toHaveCount(0);

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_inspect_drill_lens_closed",
      });
    });
  });

  test.describe("column-comparison lens", () => {
    test("should show Column Distributions lens", async ({ page, mb }) => {
      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_coldist_table",
        targetSchema: TARGET_SCHEMA,
        name: "ColDist inspect transform",
      });
      await visitInspect(page, transformId);

      await waitForInspectorDiscovery(page);

      await page.getByRole("tab", { name: /Column Distributions/ }).click();

      await expect(
        page.getByRole("heading", { name: /2 matched columns/i }),
      ).toBeVisible();

      const visualizations = page.getByTestId("visualization-root");
      await expect(visualizations).toHaveCount(4);
      // cy.each() over the four roots, asserting each contains a link.
      for (let i = 0; i < 4; i++) {
        await expect(
          visualizations.nth(i).getByRole("link"),
        ).not.toHaveCount(0);
      }
    });
  });

  test.describe("loading indicator", () => {
    test("shows the spinner only on the active tab and never leaves it stuck when switching tabs", async ({
      page,
      mb,
    }) => {
      // cy.intercept("POST", ".../query", res.setDelay(1000)) — the delay is
      // the subject of this test (it is what makes the spinner observable at
      // all), so it is ported as a real route delay rather than dropped.
      await page.route(
        /\/api\/ee\/transforms\/[^/]+\/inspect\/[^/]+\/query/,
        async (route) => {
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.fulfill({ response });
        },
      );

      const { transformId } = await createAndRunMbqlTransform(mb.api, {
        sourceTable: SOURCE_TABLE,
        targetTable: "inspect_loading_table",
        targetSchema: TARGET_SCHEMA,
        name: "Loading indicator inspect transform",
      });
      await visitInspect(page, transformId);

      await waitForInspectorDiscovery(page);

      const summaryTab = () => page.getByRole("tab", { name: /Summary/ });
      const colDistTab = () =>
        page.getByRole("tab", { name: /Column Distributions/ });

      // the active Summary tab shows a spinner while its cards load
      await expect(
        summaryTab().getByTestId("lens-tab-loader"),
      ).toBeVisible();

      // switch away before Summary finishes loading
      await colDistTab().click();

      // the previous tab does not get stuck — the fast Summary lens reverts to
      // no indicator
      await expect(
        summaryTab().getByTestId("lens-tab-loader"),
      ).toHaveCount(0);
      await expect(summaryTab().getByLabel(/clock icon/i)).toHaveCount(0);

      // the newly active tab now shows the spinner
      await expect(
        colDistTab().getByTestId("lens-tab-loader"),
      ).toBeVisible();

      // the spinner clears once the lens finishes loading
      await expect(page.getByTestId("visualization-root")).toHaveCount(4);
      await expect(
        colDistTab().getByTestId("lens-tab-loader"),
      ).toHaveCount(0);
      await expect(colDistTab().getByLabel(/clock icon/i)).toHaveCount(0);

      // switch back: the loaded tab shows no indicator, active one re-loads
      // cleanly
      await summaryTab().click();

      await expect(
        colDistTab().getByTestId("lens-tab-loader"),
      ).toHaveCount(0);
      await expect(colDistTab().getByLabel(/clock icon/i)).toHaveCount(0);

      await expect(page.getByTestId("generic-summary-tables")).toBeVisible();
      await expect(
        summaryTab().getByTestId("lens-tab-loader"),
      ).toHaveCount(0);
    });
  });

  test.describe("sql transforms", () => {
    test("should show Summary tab for a SQL transform", async ({
      page,
      mb,
    }) => {
      const { transformId } = await createAndRunSqlTransform(mb.api, {
        name: "SQL inspect transform",
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: "inspect_sql_table",
        targetSchema: TARGET_SCHEMA,
      });
      await visitInspect(page, transformId);

      await waitForInspectorDiscovery(page);

      await expect(page.getByRole("tab", { name: /Summary/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await expect(
        page.getByRole("heading", { name: /1 input table/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /1 output table/i }),
      ).toBeVisible();
    });
  });
});
