/**
 * Port of e2e/test/scenarios/dependencies/dependency-checks.cy.spec.ts (344
 * lines, 4 tests).
 *
 * ── THE HEADLINE, BEFORE ANY OF THE MECHANICS ──────────────────────────────
 *
 * All four tests are named "should not show a confirmation / warning …". The
 * confirmation they name HAS BEEN REMOVED FROM THE PRODUCT — see the long note
 * in support/dependency-checks.ts for the two commits and the verification.
 * Short version: `useCheckCardDependencies` / `useCheckTransformDependencies`
 * are no longer registered on PLUGIN_DEPENDENCIES (and no longer exist in the
 * tree at all), and `POST /api/ee/dependencies/check-card|check-transform|
 * check-snippet` have been deleted. The same commit that unwired them deleted
 * every test in this file that asserted the confirmation DOES appear.
 *
 * So these four are the negative half of a pair whose positive half is gone.
 * They are ported faithfully and completely — nothing dropped, merged or
 * renamed — but the deliverable records that they can no longer discriminate
 * the thing they are named for. Mutation testing below demonstrates that
 * directly rather than asserting it.
 *
 * ── WHAT EACH TEST ACTUALLY ASSERTS ────────────────────────────────────────
 *
 * Upstream's only assertion per test is `cy.wait("@updateCard")` /
 * `cy.wait("@updateTransform")`. That is a genuine (if narrow) negative
 * assertion and NOT a no-op: when the check still existed, a breaking change
 * opened a modal and the PUT never left the browser, so the wait timed out.
 * The port preserves exactly that shape — the `waitForResponse` promise is
 * created BEFORE the click that should trigger the request (rule 2) and
 * awaited after. No status assertion is added: upstream does not make one.
 *
 * ── PORT NOTES ─────────────────────────────────────────────────────────────
 *
 * - `cy.wait("@alias")` queue semantics do not bite here. Each alias is
 *   awaited exactly once per test, and no PUT to either path happens during
 *   fixture setup (questions/metrics/transforms are all created with POST, and
 *   `runTransformAndWaitForSuccess` uses POST /api/transform/:id/run), so there
 *   is no past response for the queue to pop.
 * - `findByText` → `getByText(…, { exact: true })`: Cypress's findByText is
 *   exact and fails on multiple matches; Playwright's default is a substring
 *   match, and strict mode supplies the fail-on-multiple half.
 * - `H.CustomExpressionEditor.clear().type(…)` and `H.NativeEditor.clear()
 *   .type(…)` → the CodeMirror-aware clear/type helper pairs, with
 *   `{ focus: false }` on the type so the chained call keeps the caret the
 *   clear left behind.
 * - Schema pinning for the `Animals` fixture lookup: see FIXTURE_SCHEMA in
 *   support/dependency-checks.ts (FINDINGS #85 — this box has 29 schemas and
 *   3 different `Animals` tables).
 */
import {
  createMbqlQuestionWithDependentMbqlQuestions,
  createMbqlTransformWithDependentMbqlTransforms,
  createMetricWithDependentMbqlQuestionsAndTransforms,
  createSqlTransformWithDependentMbqlQuestions,
  expectNoBadSnowplowEvents,
  resetSpecTargetTables,
  visitTransform,
  WRITABLE_DB_ID,
} from "../support/dependency-checks";
import {
  clearCustomExpressionEditor,
  customExpressionEditorType,
} from "../support/custom-column-3";
import { resetTestTableManySchemas } from "../support/data-studio-bulk-table";
import { waitForBackfillComplete } from "../support/dependency-graph";
import { expect, test } from "../support/fixtures";
import { clearNativeEditor } from "../support/native-extras";
import { typeInNativeEditor } from "../support/native-editor";
import { getNotebookStep, openNotebook } from "../support/notebook";
import { resyncDatabase } from "../support/schema-viewer";
import {
  installSnowplowCapture,
  type SnowplowCapture,
} from "../support/search-snowplow";
import { DataStudio } from "../support/transforms";
import { modal, popover, queryBuilderHeader, visitQuestion } from "../support/ui";

/** `cy.intercept("PUT", "/api/card/*")` — one path segment, as the glob says. */
const waitForUpdateCard = (page: import("@playwright/test").Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );

/** `cy.intercept("PUT", "/api/transform/*")`. */
const waitForUpdateTransform = (page: import("@playwright/test").Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/transform\/\d+$/.test(new URL(response.url()).pathname),
  );

test.describe("scenarios > dependencies > dependency checks", () => {
  // Gate lives at describe level, NOT inside beforeEach: a `test.skip()` in the
  // hook still runs the afterEach, which would then dereference an uninstalled
  // capture and fail every test in the gate-OFF control instead of skipping it.
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA postgres container (PW_QA_DB_ENABLED=1)",
  );

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    // The warehouse half of H.restore("*-writable") — see resetSpecTargetTables
    // in support/dependency-checks.ts. Runs before the app-DB restore, as
    // upstream's does.
    await resetSpecTargetTables();
    await mb.restore("postgres-writable");
    await resetTestTableManySchemas();
    await mb.signInAsAdmin();
    // Traced empirically on slot 4104: this token turns on 42 features and
    // `dependencies: true`, which is the predicate BOTH the /api/ee/dependencies
    // route tree (api_routes/routes.clj:123) and the FE plugin
    // (dependencies/index.ts:16 hasPremiumFeature("dependencies")) gate on.
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["Animals"],
    });
    // H.resetSnowplow() — the capture is installed fresh per test and must be
    // installed before the first navigation (the tracker is built during app
    // bootstrap).
    capture = await installSnowplowCapture(page, mb.baseUrl);
  });

  test.afterEach(async () => {
    // H.expectNoBadSnowplowEvents() — degraded to a structural check; see the
    // vantage note in support/dependency-checks.ts.
    expectNoBadSnowplowEvents(capture);
  });

  test.describe("questions", () => {
    test("should not show a confirmation if there are no breaking changes when updating a MBQL question", async ({
      page,
      mb,
    }) => {
      const questionId =
        await createMbqlQuestionWithDependentMbqlQuestions(mb.api);
      // The dependency graph is backfilled ASYNCHRONOUSLY (dependencies/
      // events.clj: card create/update only marks entities stale; "the backfill
      // task does the actual computation"). Wait for the product's own
      // readiness signal before driving the UI. See the spec-level note at the
      // bottom of this file for what this does and does not buy here.
      await waitForBackfillComplete(mb.api);

      await visitQuestion(page, questionId);
      await openNotebook(page);
      await getNotebookStep(page, "expression")
        .getByText("Expr", { exact: true })
        .click();
      await clearCustomExpressionEditor(page);
      await customExpressionEditorType(page, "2 + 2", { focus: false });
      await popover(page).getByRole("button", { name: "Update" }).click();

      const updateCard = waitForUpdateCard(page);
      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();
      await updateCard;
    });
  });

  test.describe("metrics", () => {
    test("should not show a warning when a change to a metric is backward-compatible with existing content", async ({
      page,
      mb,
    }) => {
      const metricId =
        await createMetricWithDependentMbqlQuestionsAndTransforms(mb.api);
      await waitForBackfillComplete(mb.api);

      await page.goto(`/metric/${metricId}/query`);
      await getNotebookStep(page, "summarize")
        .getByText("Min of Score", { exact: true })
        .click();
      await popover(page).getByText("Name", { exact: true }).click();

      const updateCard = waitForUpdateCard(page);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await updateCard;
    });
  });

  test.describe("transforms", () => {
    const goToEditorAndType = async (
      page: import("@playwright/test").Page,
      queryString: string,
    ) => {
      await DataStudio.Transforms.clickEditDefinition(page);
      await expect(page).toHaveURL(/\/edit/);
      await clearNativeEditor(page);
      await typeInNativeEditor(page, queryString, { focus: false });
    };

    test("should not show a confirmation if there are no breaking changes when updating a SQL transform after it was run", async ({
      page,
      mb,
    }) => {
      const transformId =
        await createSqlTransformWithDependentMbqlQuestions(mb.api);
      await waitForBackfillComplete(mb.api);

      await visitTransform(page, transformId);
      await goToEditorAndType(
        page,
        'SELECT score, name FROM "Schema A"."Animals"',
      );

      const updateTransform = waitForUpdateTransform(page);
      await DataStudio.Transforms.saveChangesButton(page).click();
      await updateTransform;
    });

    test("should not show a confirmation if there are no breaking changes when updating a MBQL transform before it was run", async ({
      page,
      mb,
    }) => {
      const transformId =
        await createMbqlTransformWithDependentMbqlTransforms(mb.api);
      await waitForBackfillComplete(mb.api);

      await visitTransform(page, transformId);
      await DataStudio.Transforms.clickEditDefinition(page);
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Sort" })
        .click();
      await popover(page).getByText("Score", { exact: true }).click();

      const updateTransform = waitForUpdateTransform(page);
      await DataStudio.Transforms.saveChangesButton(page).click();
      await updateTransform;
    });
  });
});
