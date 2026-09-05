/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/model-to-transform.cy.spec.ts
 * (406 lines, 7 tests: 5 inside a "Successful conversions" describe plus 2
 * top-level). Every upstream `it` has a counterpart here, in upstream order,
 * with nothing dropped, merged or weakened.
 *
 * ============================ QA-DATABASE TIER ============================
 * Upstream tags the sole top-level describe `@external`, and `@cypress/grep`
 * propagates suite tags downward, so the tag gates the whole file. The tag is
 * ACCURATE here — unusually, given the ~20 specs that restore a `*-writable`
 * snapshot without one (#123). What the `beforeEach` actually does:
 *
 *   dropAllTestTables()            → DDL against the writable QA Postgres
 *   H.restore("postgres-writable") → snapshot where database 2 is genuinely
 *                                    the WRITABLE container (verified on
 *                                    `name`/`details.dbname`: "Writable
 *                                    Postgres12" / `writable_db` on :5404 —
 *                                    NOT the read-only QA sample that
 *                                    `postgres-12` puts at id 2)
 *   cy.signInAsAdmin()
 *   H.activateToken("bleeding-edge")
 *   cy.intercept(POST /api/ee/replacement/replace-model-with-transform)
 *
 * So the container dependency is real and the gate is `PW_QA_DB_ENABLED`.
 * The gate-OFF control is reported in findings-inbox/model-to-transform.md;
 * a green run with everything skipped is the failure mode, not the goal
 * (FINDINGS #49).
 *
 * ============================== TOKEN TIER ================================
 * `bleeding-edge` (= MB_ALL_FEATURES_TOKEN) is required, and the gate is
 * REAL on both sides — traced rather than assumed, because the sibling
 * transforms specs found the opposite (`transforms-basic` gates nothing,
 * because `query-transforms-enabled?` short-circuits on `(not is-hosted?)`).
 * The predicate for THIS surface is a different one and does not
 * short-circuit:
 *
 *   BACKEND  enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:127
 *              "/replacement" (premium-handler …replacement.api/routes :dependencies)
 *            → every /api/ee/replacement/* route 402s without `:dependencies`.
 *   FRONTEND enterprise/frontend/src/metabase-enterprise/replacement/index.ts:12
 *              if (hasPremiumFeature("dependencies")) { … PLUGIN_REPLACEMENT
 *              .getTransformToolsRoutes = getTransformToolsRoutes … }
 *            → without `:dependencies` the /data-studio/transforms/tools/
 *              migrate-models ROUTE is never registered at all.
 *
 * Measured on the slot backend: an activated `bleeding-edge` token reports 53
 * features on with `dependencies: true` (a bare restore reports 0 on, i.e.
 * `dependencies: false`). Both halves of the gate therefore bite, and there is
 * no OSS fallback path to test against.
 *
 * =============================== PORT NOTES ===============================
 * - The lone `cy.intercept(...).as("replaceModelWithTransform")` is awaited
 *   exactly once per conversion, inside `waitForReplacementToComplete`, AFTER
 *   the submit click. Playwright's `waitForResponse` does not pop past
 *   responses, so the promise is created before the click
 *   (support/model-to-transform.ts `convertModelToTransform`). No response
 *   QUEUE is needed here — unlike model-actions, nothing relies on a
 *   retroactive match.
 * - `H.resyncDatabase({ dbId })` bare-form gates on nothing; both call sites
 *   here immediately look a *newly created* table up by id, so the port passes
 *   `tables`. A wait, not an assertion.
 * - `MigrateModelsPage` reads the SEARCH INDEX (`useSearchQuery({ models:
 *   ["dataset"], context: "model-migration" })`) and RTK-Query caches the
 *   result per mount, so assertion retry cannot rescue a raced read. The port
 *   polls the index before navigating (`waitForModelInSearch`). Cypress's
 *   command-queue latency covered this implicitly.
 * - The replacement runner resolves dependents from the DEPENDENCY GRAPH,
 *   which is maintained by an asynchronous backfill job — a conversion that
 *   outruns it silently rewrites nothing and still reports `succeeded`. That
 *   is the one genuine run-1 failure (see `waitForDependencyBackfill`), and it
 *   is a pacing difference, not a product bug: Cypress's command queue always
 *   supplied the gap. Fixed with the product's own readiness endpoint.
 * - `findByText`/`findByLabelText` with string args are EXACT (rule 1);
 *   `findByRole(..., { name: /re/ })` stays a case-sensitive regex.
 * - Upstream's `cy.log()` lines are preserved as comments.
 *
 * ============================ ENVIRONMENT NOTE ============================
 * The output-table SCHEMA is environment-dependent here, and it is worth
 * knowing before reading a failure. `ReplaceWithTransformModal` defaults
 * `targetSchema` to `schemas[0]` from `GET /api/database/2/syncable_schemas`,
 * and upstream never touches that field. On a fresh CI container that is
 * `public`; on this shared box the writable container carries ~29 debris
 * schemas (#85) and `schemas[0]` is `"Domestic"`. Nothing the spec asserts
 * depends on the schema (only on the humanized table LABEL), so the port
 * stays faithful and does not pick a schema — but it does mean upstream's
 * unqualified `DROP TABLE IF EXISTS mtt_output_table` cannot reach the output
 * table on this box. Recorded in the findings note.
 */
import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import {
  MIGRATE_MODELS_PATH,
  OUTPUT_TABLE_LABEL,
  QA_DB_SKIP_REASON,
  SOURCE_ROW_NAME,
  SOURCE_ROW_NAME_2,
  SOURCE_TABLE_LABEL,
  assertDataSourceIs,
  assertSourceRowsVisible,
  convertModelToTransform,
  convertTriggerButton,
  createFilteredDashboardOnModel,
  createQuestionJoiningModel,
  createQuestionOnCard,
  createQuestionOnModel,
  createSourceModel,
  createTestTables,
  dropAllTestTables,
  openMigrateModelsPage,
  selectModelInTable,
  waitForModelInSearch,
} from "../support/model-to-transform";
import { toggleFilterWidgetValues } from "../support/dashboard-card-repros";
import { createQuestion } from "../support/factories";
import { visitMetric } from "../support/metrics";
import { openNotebook } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID } from "../support/schema-viewer";
import { main, visitDashboard, visitQuestion } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > data-studio > model to transform", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    test.skip(
      !resolveToken("bleeding-edge"),
      "Needs the bleeding-edge token (MB_ALL_FEATURES_TOKEN): /api/ee/replacement is premium-gated on `dependencies`, and the migrate-models route is only registered when hasPremiumFeature('dependencies')",
    );

    await dropAllTestTables();

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");

    // cy.intercept("POST", "/api/ee/replacement/replace-model-with-transform")
    //   .as("replaceModelWithTransform") — registered per-conversion instead;
    // see convertModelToTransform's docstring.
  });

  test.describe("Successful conversions", () => {
    test("updates direct and nested questions built on the converted model", async ({
      page,
      mb,
    }) => {
      await createTestTables(mb.api);
      const model = await createSourceModel(mb.api, "Target model");
      const direct = await createQuestionOnModel(
        mb.api,
        "Direct dependent",
        model.id,
      );
      const parent = await createQuestionOnCard(
        mb.api,
        "Nested dependent",
        model.id,
      );
      const secondLevel = await createQuestion(mb.api, {
        name: "Second level nested",
        database: WRITABLE_DB_ID,
        query: { "source-table": `card__${parent.id}` },
      });

      await convertModelToTransform(page, mb.api, "Target model");

      // direct dependent now reads from the transform's output table
      await visitQuestion(page, direct.id);
      await assertSourceRowsVisible(page);
      await openNotebook(page);
      await assertDataSourceIs(page, OUTPUT_TABLE_LABEL);

      // two-level nested question still runs after the swap
      await visitQuestion(page, secondLevel.id);
      await assertSourceRowsVisible(page);
    });

    test("creates a transform that can be opened and queries the original source table", async ({
      page,
      mb,
    }) => {
      await createTestTables(mb.api);
      await createSourceModel(mb.api, "Transform source model");

      await convertModelToTransform(page, mb.api, "Transform source model");

      // new transform appears on the transform list and opens cleanly
      await page.goto("/data-studio/transforms");
      await main(page)
        .getByText("Transform source model", { exact: true })
        .click();
      await assertDataSourceIs(page, SOURCE_TABLE_LABEL);
    });

    test("keeps a dashboard with a parameter filter working after conversion", async ({
      page,
      mb,
    }) => {
      await createTestTables(mb.api);
      const model = await createSourceModel(mb.api, "Dashboard model");
      const { dashboard_id, card_id } = await createFilteredDashboardOnModel(
        mb.api,
        model.id,
      );

      await convertModelToTransform(page, mb.api, "Dashboard model");

      // dashboard still renders after conversion
      await visitDashboard(page, mb.api, dashboard_id);
      await expect(
        main(page).getByText(SOURCE_ROW_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText(SOURCE_ROW_NAME_2, { exact: true }),
      ).toBeVisible();

      // filter widget still narrows the results
      await toggleFilterWidgetValues(page, ["A"]);
      await expect(
        main(page).getByText(SOURCE_ROW_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText(SOURCE_ROW_NAME_2, { exact: true }),
      ).toHaveCount(0);

      // the underlying question now points to the transform output
      await visitQuestion(page, card_id);
      await openNotebook(page);
      await assertDataSourceIs(page, OUTPUT_TABLE_LABEL);
    });

    test("keeps a metric built on the model producing the same result", async ({
      page,
      mb,
    }) => {
      await createTestTables(mb.api);
      const model = await createSourceModel(mb.api, "Metric base model");
      const metric = await createQuestion(mb.api, {
        name: "Amount sum metric",
        database: WRITABLE_DB_ID,
        type: "metric",
        query: {
          "source-table": `card__${model.id}`,
          aggregation: [
            ["sum", ["field", "amount", { "base-type": "type/Decimal" }]],
          ],
        },
      });

      await convertModelToTransform(page, mb.api, "Metric base model");

      await visitMetric(page, metric.id);
      await expect(
        main(page).getByText("301.25", { exact: true }),
      ).toBeVisible();
    });

    test("keeps a joined question working after converting its joined model", async ({
      page,
      mb,
    }) => {
      await createTestTables(mb.api);
      const model = await createSourceModel(mb.api, "Joined model");
      const joined = await createQuestionJoiningModel(
        mb.api,
        "Joined question",
        model.id,
      );

      await convertModelToTransform(page, mb.api, "Joined model");

      await visitQuestion(page, joined.id);
      await assertSourceRowsVisible(page);
    });
  });

  test("disables the trigger when the model's database doesn't support transforms", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, {
      name: "Sample DB model",
      database: SAMPLE_DB_ID,
      type: "model",
      query: { "source-table": ORDERS_ID },
    });

    await waitForModelInSearch(mb.api, "Sample DB model");
    await openMigrateModelsPage(page);
    await selectModelInTable(page, "Sample DB model");

    await expect(convertTriggerButton(page)).toBeDisabled();
  });

  test("non-admin users cannot access the migrate models page", async ({
    page,
    mb,
  }) => {
    await createTestTables(mb.api);
    await createSourceModel(mb.api, "Access test model");

    await mb.signInAsNormalUser();
    await page.goto(MIGRATE_MODELS_PATH);
    await expect(
      main(page).getByText("Sorry, you don’t have permission to see that.", {
        exact: true,
      }),
    ).toBeVisible();
  });
});
