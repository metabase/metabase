/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/transforms/transforms.cy.spec.ts
 *
 * ============================ SCOPE OF THIS PORT ============================
 * The Cypress original is 4,394 lines — the largest spec in the corpus. It was
 * ported over FOUR sessions and is now COMPLETE: every upstream `it` has a
 * counterpart here, in upstream order, with nothing dropped or merged. See
 * findings-inbox/transforms.md for the per-session record.
 *
 *   session 1: upstream 35-1716   (creation … queries)
 *   session 2: upstream 1717-2036 (runs, deletion, disconnected database,
 *                                  cancelation, dependencies)
 *   session 3: upstream 2038-2846 (python > common library, collections,
 *                                  revision history, read-only remote sync)
 *   session 4: upstream 2847-4394 (databases without :schemas, jobs, runs,
 *                                  the @python script test-run, the
 *                                  no-supported-databases describe, and the
 *                                  three permissions describes)
 *
 * Tests that do not EXECUTE here are gated or fixme'd with the measurement
 * inline; there are three separate reasons and they are not interchangeable:
 *   - PW_QA_DB_ENABLED  — needs the writable QA postgres / QA MySQL containers.
 *   - PW_PYTHON_RUNNER_ENABLED — needs the python-runner (:5001) and
 *     localstack S3 (:4566). Probed, not assumed: there is NO 402 here, the
 *     token carries `transforms-python: true` and `POST
 *     /api/ee/transforms-python/test-run` fails with a 500 "Connection refused"
 *     to :4566.
 *   - test.fixme — three tests blocked because the local
 *     `MB_PRO_SELF_HOSTED_TOKEN` lacks the `transforms-basic` feature
 *     (`^{:added "0.59.0"}`, newer than the token). Measured, with the exact
 *     FE gate cited at each site.
 * ===========================================================================
 *
 * QA-DATABASE TIER. Upstream is `@external`: it restores the
 * `postgres-writable` snapshot, resets the `many_schemas` test table and drives
 * WRITABLE_DB_ID (the writable QA postgres on :5404). Gated on
 * PW_QA_DB_ENABLED — and unlike the other QA-DB ports, this one EXECUTES when
 * the gate is on (verified: the writable DB is synced, transforms create real
 * postgres tables and the runs succeed). A green run with everything skipped
 * would be the failure mode, not the goal (FINDINGS #49) — see the findings
 * note for the executed-vs-skipped counts and the gate-off control.
 *
 * PYTHON TIER. Upstream's `@python` tests additionally need a python-runner on
 * :5001 and a localstack S3 on :4566 (H.setPythonRunnerSettings), neither of
 * which is provisioned here. They are gated on PW_PYTHON_RUNNER_ENABLED and
 * reported separately — see findings-inbox/transforms.md.
 *
 * Port notes:
 * - Snowplow: these events (`transform_create`, `transform_created`,
 *   `transform_trigger_manual_run`) are FE-emitted from
 *   frontend/src/metabase/transforms/analytics.ts, so they are captured at the
 *   browser boundary with installSnowplowCapture rather than stubbed to a
 *   no-op — the events ARE asserted here, and stubbing would make each
 *   assertion vacuous (PORTING rule 6 / "Capturing snowplow without micro").
 *   H.expectNoBadSnowplowEvents degrades to the structural check documented in
 *   support/search-snowplow.ts (no Iglu validation without micro).
 * - The eight beforeEach cy.intercept aliases become register-before/await-after
 *   waitForResponse helpers in support/transforms.ts (PORTING rule 2).
 * - `cy.findByLabelText(x).clear().type(y)` → click + fill("") + pressSequentially,
 *   because `cy.type()` clicks its subject first and these fields drive
 *   auto-population logic off per-keystroke change events.
 * - `should("not.exist")` → `toHaveCount(0)` (both retry; the faithful port),
 *   always anchored on a positive signal asserted in the same block.
 * - Transform runs are asynchronous — every run anchors on the run button's own
 *   completion label ("Ran successfully" / "Run failed"), exactly as upstream
 *   does, never on a sleep.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { createLibraryWithItems } from "../support/data-studio-library";
import { goToMainApp } from "../support/filters-repros";
import { miniPicker, entityPickerModal, assertQueryBuilderRowCount, getNotebookStep } from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import { entityPickerModalItem, miniPickerHeader } from "../support/question-new";
import { pickEntity } from "../support/dashboard";
import { resyncDatabase } from "../support/schema-viewer";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { countResponses } from "../support/question-reproductions-2";
import { undoToast } from "../support/metrics";
import { resetManySchemasTable } from "../support/transforms-codegen";
import { waitForBackfillComplete } from "../support/dependency-graph";
import {
  icon,
  main,
  modal,
  newButton,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";
import { FieldSection, TableSection } from "../support/data-model";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  CUSTOM_SCHEMA,
  DB_NAME,
  DataStudio,
  QA_DB_SKIP_REASON,
  SOURCE_TABLE,
  TARGET_SCHEMA,
  TARGET_SCHEMA_2,
  TARGET_TABLE,
  TARGET_TABLE_2,
  WRITABLE_DB_ID,
  assertOptionNotSelected,
  assertOptionSelected,
  assertTableDoesNotExistError,
  createMbqlTransform,
  createSqlTransform,
  createTransform,
  getCancelButton,
  getRunButton,
  getRunErrorInfoButton,
  getRunListLink,
  getRunStatus,
  getRunsNavLink,
  getTransformRunTable,
  runTransformInUiAndWaitForFailure,
  verifyDisconnectedDatabaseBanner,
  waitForApi,
  waitForDeleteTransform,
  getFieldPicker,
  getIncrementalSwitch,
  getQueryEditor,
  getQueryVisualization,
  getSchemaLink,
  getTableId,
  getTableLink,
  getTagsInput,
  getTransformsList,
  getTransformsNavLink,
  getTransformsTargetContent,
  isIncrementalSwitchDisabled,
  isIncrementalSwitchEnabled,
  resetCompositePkTable,
  resetTransformTargetTables,
  runTransformInUiAndWaitForSuccess,
  tooltip,
  visitTransformListPage,
  waitForCreateTag,
  waitForCreateTransform,
  waitForDeleteTag,
  waitForDeleteTransformTable,
  getDatabaseLink,
  waitForUpdateField,
  waitForUpdateTag,
  waitForUpdateTransform,
  clearPythonEditor,
  getLibraryEditorHeader,
  pythonEditorValue,
  typePythonEditor,
  visitCommonLibrary,
  collectionPickerButton,
  collectionPickerDialog,
  collectionRowOptions,
  createTransformCollection,
  getRowNames,
  getTransformHeaderEllipsis,
  getTransformHistoryList,
  getTransformNameInput,
  transformsSearchInput,
  createTransformJob,
  createTransformTag,
  getCronInput,
  getJobRow,
  getJobTransformTable,
  getScheduleFrequencyInput,
  getScheduleTimeInput,
  openBulkActionsMenu,
  runJobAndWaitForFailure,
  runJobAndWaitForSuccess,
  visitJobListPage,
  visitRunListPage,
  visitTransformJob,
  waitForApiRequestBody,
  waitForCreateJob,
  waitForDeleteJob,
  waitForSucceededTransformRuns,
  waitForUpdateJob,
  checkSortingOrder,
  getEndAtFilterWidget,
  getRunMethodFilterWidget,
  getStartAtFilterWidget,
  getStatusFilterWidget,
  getTagFilterWidget,
  getTransformFilterWidget,
} from "../support/transforms";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { setUserAsAnalyst } from "../support/datamodel-data-studio";
import { ALL_USERS_GROUP_ID, NORMAL_USER_ID } from "../support/ai-controls";
import { DATA_GROUP } from "../support/admin-permissions";
import {
  type RemoteSyncRepo,
  configureGit,
  setupGitSync,
  teardownGitSync,
} from "../support/remote-sync";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { nativeEditor, typeInNativeEditor } from "../support/native-editor";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const PYTHON_SKIP_REASON =
  "Needs the python-runner (:5001) + localstack S3 (:4566) that H.setPythonRunnerSettings points at (set PW_PYTHON_RUNNER_ENABLED)";

/** Port of `cy.button(name)`: findByRole("button", { name }) — exact. */
function button(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

/**
 * Port of `cy.findByLabelText(x).clear().type(y)`. `cy.type()` clicks its
 * subject first (PORTING), and these two fields drive per-keystroke
 * auto-population, so the port clicks, clears and types for real.
 */
async function clearAndType(field: Locator, text: string) {
  await field.click();
  await field.fill("");
  await field.pressSequentially(text);
}

/** Port of `cy.findByLabelText(x).type(y)` — append at the caret's end. */
async function appendType(field: Locator, text: string) {
  await field.click();
  await field.press("End");
  await field.pressSequentially(text);
}

/** The change-target modal's fields. */
const newTableNameField = (scope: Locator) =>
  scope.getByLabel("New table name", { exact: true });
const schemaField = (scope: Locator) =>
  scope.getByLabel("Schema", { exact: true });

/**
 * Port of the spec-local visitTableQuestion(): an ad-hoc native question over
 * the transform's target table, visited.
 */
async function visitTableQuestion(
  page: Page,
  api: import("../support/api").MetabaseApi,
  {
    targetTable = TARGET_TABLE,
    targetSchema = TARGET_SCHEMA,
  }: { targetTable?: string; targetSchema?: string } = {},
) {
  const card = await createNativeQuestion(api, {
    database: WRITABLE_DB_ID,
    native: {
      query: `SELECT * FROM "${targetSchema}"."${targetTable}"`,
      "template-tags": {},
    },
  });
  await visitQuestion(page, card.id);
}

/** The transform-save modal's two fields. */
const nameField = (scope: Locator) => scope.getByLabel("Name", { exact: true });
const tableNameField = (scope: Locator) =>
  scope.getByLabel("Table name", { exact: true });

/**
 * Port of `cy.findAllByTestId("picker-item").contains(name)` where the chained
 * assertion is on `data-disabled`. Measured against the live DOM: `picker-item`
 * is a wrapper `Box`; the attribute lives on the Mantine `NavLink`
 * `<a role="link">` inside it (ItemList.tsx:112-118), which is what Cypress's
 * `.contains()` resolves to. Selecting the wrapper reads `data-disabled: null`
 * for BOTH the enabled and disabled rows — i.e. the naive port would make the
 * negative assertion pass vacuously.
 */
function pickerItemLink(page: Page, name: RegExp): Locator {
  return entityPickerModal(page)
    .getByTestId("picker-item")
    .filter({ hasText: name })
    .getByRole("link");
}

/**
 * Port of `H.undoToast().should("contain.text", x)` / `.findByText(x)`.
 *
 * Cypress's `findByTestId` throws on multiple matches, so upstream implicitly
 * assumes a single toast. Two of these tests fire the same action twice in
 * quick succession and the outgoing toast is still mounted when the next one
 * appears (measured: 2 `toast-undo` nodes with identical text), which is
 * PORTING's documented transient-duplicate case. Filter by the text and take
 * the first match. LIMITATION, stated because it is real: when both toasts
 * carry identical text this cannot distinguish the new one from the old — the
 * same limitation upstream's assertion has.
 */
function expectUndoToast(page: Page, text: string) {
  return expect(
    undoToast(page).filter({ hasText: text }).first(),
  ).toBeVisible();
}

/**
 * Port of `H.popover().findByText(tag).parent().findByLabelText(action)` — the
 * rename/delete icon button on a tag row in the tags dropdown.
 */
function tagRowAction(page: Page, tag: string, action: string): Locator {
  return popover(page)
    .getByText(tag, { exact: true })
    .locator("xpath=..")
    .getByLabel(action);
}

/**
 * Port of the repeated mini-picker DB → schema → table drill.
 *
 * Each level is anchored on the response that populates it (PORTING: "a list
 * that re-renders under a resolved locator clicks the WRONG ROW"). Measured
 * here, not assumed: without the anchors the schema click landed on
 * "Domestic" (the row above "Schema A" in the 27-row schema list) often enough
 * that the target schema came out wrong — surfacing two steps later as
 * `schema-link` reading "Domestic". Cypress's command queue paced the clicks
 * past the settle.
 */
async function pickWritableAnimals(page: Page) {
  const picker = miniPicker(page);
  const schemas = page.waitForResponse((response) =>
    /^\/api\/database\/\d+\/schemas$/.test(new URL(response.url()).pathname),
  );
  await picker.getByText(DB_NAME, { exact: true }).click();
  await schemas;

  const tables = page.waitForResponse((response) =>
    /^\/api\/database\/\d+\/schema\//.test(new URL(response.url()).pathname),
  );
  await picker.getByText(TARGET_SCHEMA, { exact: true }).click();
  await tables;

  await picker.getByText(SOURCE_TABLE, { exact: true }).click();
}

test.describe("scenarios > admin > transforms", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // Not in the Cypress original — see resetTransformTargetTables' docstring.
    await resetTransformTargetTables();
    // H.resetSnowplow() — the capture is fresh per test, so installing it is
    // the reset.
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
    // capture was never installed. Found by the gate-OFF control run.
    if (!capture) {
      return;
    }
    // H.expectNoBadSnowplowEvents() — structural stand-in (no snowplow-micro,
    // so no Iglu schema validation; see support/search-snowplow.ts).
    expectNoBadSnowplowEvents(capture);
  });

  test.describe("creation", () => {
    test("should be able to create and run an mbql transform", async ({
      page,
    }) => {
      // create a new transform
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_create",
        event_detail: "query",
      });

      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "MBQL");

      // should auto-populate table name based on transform name...
      await expect(tableNameField(dialog)).toHaveValue("mbql");
      await clearAndType(tableNameField(dialog), TARGET_TABLE);

      // ...unless user has manually modified the table name
      await appendType(nameField(dialog), " transform");
      await expect(tableNameField(dialog)).toHaveValue(TARGET_TABLE);

      const created = waitForCreateTransform(page);
      await button(dialog, "Save").click();
      await created;

      // run the transform and make sure its table can be queried
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_trigger_manual_run",
      });

      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText("Transform Table", { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_created",
      });
    });

    test("should not show you the library in the mini picker when building transforms (uxw-2403)", async ({
      page,
      mb,
    }) => {
      await createLibraryWithItems(mb.api);

      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      const picker = miniPicker(page);
      await expect(picker.getByText(DB_NAME, { exact: true })).toBeVisible();
      await expect(
        picker.getByText("Our analytics", { exact: true }),
      ).toBeVisible();
      await expect(picker.getByText("Browse all", { exact: true })).toBeVisible();
      // Anchored on the three positives above, which prove the picker rendered.
      await expect(picker.getByText("Data", { exact: true })).toHaveCount(0);

      await goToMainApp(page);
      await button(modal(page), "Discard changes").click();
      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();

      const picker2 = miniPicker(page);
      await expect(
        picker2.getByText("Browse all", { exact: true }),
      ).toBeVisible();
      await expect(
        picker2.getByText("Our analytics", { exact: true }),
      ).toHaveCount(0);
      await picker2.getByText("Data", { exact: true }).click();
      await expect(picker2.getByText("Orders", { exact: true })).toBeVisible();
    });

    test("should be able to create and run a SQL transform", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      // Anchor the database list on the fetch that populates it — without this
      // the row resolves, then the list re-renders and Playwright reports
      // "element is not visible → element was detached" (PORTING: a list that
      // re-renders under a resolved locator).
      const databases = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/database",
      );
      await popover(page).getByText("SQL query", { exact: true }).click();
      await databases;
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_create",
        event_detail: "native",
      });

      // Upstream does `H.popover().findByText(DB_NAME).click()` here. Measured
      // on the jar: the database popover ("Sample Database / Writable
      // Postgres12") IS open at t=0 but is gone by t=500ms — with only one
      // transform-capable database the app auto-selects it and unmounts the
      // picker, so the click is a race that Cypress runs too and that is a
      // no-op when it loses (it left "html intercepts pointer events" then
      // "element was detached" here). Assert the state the click exists to
      // produce rather than racing a disappearing element.
      await expect(page.getByTestId("gui-builder-data")).toContainText(DB_NAME);
      await typeInNativeEditor(
        page,
        `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
      );
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "SQL transform");
      await appendType(tableNameField(dialog), TARGET_TABLE);
      const created = waitForCreateTransform(page);
      await button(dialog, "Save").click();
      await created;

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_created",
      });

      // run the transform and make sure its table can be queried
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_trigger_manual_run",
      });

      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText(DB_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be possible to create and run a Python transform", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
      // Ported body lives with the rest of the @python tier — see
      // findings-inbox/transforms.md. Not written: the tier cannot be executed
      // here, and PORTING forbids shipping an unverifiable body as green.
    });

    test("should be able to create and run a transform from a question or a model", async ({
      page,
      mb,
    }) => {
      const testCardSource = async (type: "question" | "model") => {
        capture.reset();

        // create a query in the target database
        // `schema` pinned — DEVIATION forced by container contamination (see
        // the identical note on the #64473 test). Upstream leaves it unpinned,
        // which is fine when the only "Animals" tables are the 26 identical
        // `many_schemas` ones. The shared local writable_db also holds
        // `Domestic"."Animals` (embedding-hub's `multi_schema` fixture) with
        // **0 rows**; when that wins the id-ordered lookup the whole test reads
        // "Showing 0 rows". Measured: 2/2 failures under --repeat-each=2 before
        // pinning, 0 after; no-op on a clean container.
        const tableId = await getTableId(mb.api, {
          name: SOURCE_TABLE,
          databaseId: WRITABLE_DB_ID,
          schema: TARGET_SCHEMA,
        });
        await createQuestion(mb.api, {
          name: `Test ${type}`,
          type,
          database: WRITABLE_DB_ID,
          query: { "source-table": tableId },
        });

        // create a new transform
        await visitTransformListPage(page);
        await button(page, "Create a transform").click();
        await popover(page)
          .getByText("Copy of a saved question", { exact: true })
          .click();
        await expectUnstructuredSnowplowEvent(capture, {
          event: "transform_create",
          event_detail: "saved-question",
        });

        await pickEntity(page, {
          path: ["Our analytics", `Test ${type}`],
          select: true,
        });

        await button(getQueryEditor(page), "Save").click();
        const dialog = modal(page);
        await clearAndType(nameField(dialog), `${type} transform`);
        await appendType(tableNameField(dialog), `${type}_transform`);
        const created = waitForCreateTransform(page);
        await button(dialog, "Save").click();
        await created;

        await expectUnstructuredSnowplowEvent(capture, {
          event: "transform_created",
        });

        // run the transform and make sure its table can be queried
        await DataStudio.Transforms.runTab(page).click();
        await runTransformInUiAndWaitForSuccess(page);
        await expectUnstructuredSnowplowEvent(capture, {
          event: "transform_trigger_manual_run",
        });

        await DataStudio.Transforms.settingsTab(page).click();
        await (await getTableLink(page)).click();
        await expect(
          queryBuilderHeader(page).getByText(DB_NAME, { exact: true }),
        ).toBeVisible();
        await assertQueryBuilderRowCount(page, 3);
      };

      await testCardSource("question");
      await testCardSource("model");
    });

    test("should be possible to convert an MBQL transform to a SQL transform", async ({
      page,
      mb,
    }) => {
      const EXPECTED_QUERY = `SELECT
  "Schema A"."Animals"."name" AS "name",
  "Schema A"."Animals"."score" AS "score"
FROM
  "Schema A"."Animals"
LIMIT
  5`;

      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.clickEditDefinition(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/edit");

      await getQueryEditor(page).getByLabel("View SQL").click();
      const sidebar = page.locator("main aside");
      await expect(sidebar).toBeVisible();
      // CodeMirror renders each line in its own div, so textContent carries no
      // newlines — H.NativeEditor.value() reads the visual text. useInnerText.
      await expect(nativeEditor(page)).toHaveText(EXPECTED_QUERY, {
        useInnerText: true,
      });

      await sidebar
        .getByText("Convert this transform to SQL", { exact: true })
        .click();
      await expect(sidebar).toBeVisible();

      // CodeMirror renders each line in its own div, so textContent carries no
      // newlines — H.NativeEditor.value() reads the visual text. useInnerText.
      await expect(nativeEditor(page)).toHaveText(EXPECTED_QUERY, {
        useInnerText: true,
      });
      const updated = waitForUpdateTransform(page);
      await button(getQueryEditor(page), "Save").click();
      await updated;
      // Saving returns to read-only view mode; the "Run" tab only exists there,
      // so wait for the navigation off /edit before clicking it.
      await expect
        .poll(() => new URL(page.url()).pathname)
        .not.toContain("/edit");

      // run the transform and make sure its table can be queried
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_trigger_manual_run",
      });

      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText(DB_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should not include absolute-max-results LIMIT in SQL preview for MBQL transforms", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.clickEditDefinition(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/edit");

      await getQueryEditor(page).getByLabel("View SQL").click();
      const sidebar = page.locator("main aside");
      await expect(sidebar).toBeVisible();
      // Anchor: the compiled SQL must actually be rendered before asserting an
      // absence, otherwise the check is vacuous.
      await expect(sidebar).toContainText('"Schema A"."Animals"');

      // DELIBERATE DEVIATION — upstream's assertion is vacuous and its literal
      // port cannot pass. Upstream writes
      //   H.sidebar().should("be.visible").and("not.contain", /\bLIMIT\b/i)
      // and chai-jquery's `contain` STRINGIFIES its argument (it is a
      // `:contains(...)` substring test, not a regex test), so it searches the
      // sidebar for the literal text "/\bLIMIT\b/i" — never present, always
      // passing. The preview genuinely does contain a LIMIT: the transform's
      // own `limit: 5` compiles to "LIMIT\n  5" (measured on the jar). The
      // test's stated intent is the absolute-max-results limit
      // (qp.settings/absolute-max-results = 1048575), so that is what this
      // asserts. See findings-inbox/transforms.md.
      await expect(sidebar).not.toContainText("1048575");
      // …and the only LIMIT present is the transform's own.
      await expect(sidebar).toContainText(/LIMIT\s+5/);
    });

    test("should not allow to overwrite an existing table when creating a transform", async ({
      page,
    }) => {
      // open the new transform page
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      // set the query
      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "MBQL transform");
      await clearAndType(tableNameField(dialog), SOURCE_TABLE);
      const created = waitForCreateTransform(page);
      await button(dialog, "Save").click();
      await created;

      await expect(
        modal(page).getByText("A table with that name already exists.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should be able to create a new schema when saving a transform", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "MBQL transform");
      await clearAndType(tableNameField(dialog), TARGET_TABLE);
      await clearAndType(dialog.getByLabel("Schema", { exact: true }), CUSTOM_SCHEMA);

      // The option renders as "Create new schema <name>" — testing-library's exact
      // findByText matched the inner text node; Playwright compares full element
      // text, so match as a substring regex (PORTING mixed-content rule).
      await popover(page).getByText(/Create new schema/).click();
      const created = waitForCreateTransform(page);
      await button(modal(page), "Save").click();
      await created;

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(CUSTOM_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute("aria-disabled", "true");
      // The link's inner span intercepts the pointer (upstream used realHover,
      // which is coordinate-based and does not run actionability checks).
      await getSchemaLink(page).hover({ force: true });
      const tip = tooltip(page).first();
      await expect(tip).toBeVisible();
      await expect(tip).toHaveText(
        "This schema will be created when the transform runs",
      );
      const inactiveTableLink = await getTableLink(page, { isActive: false });
      await expect(inactiveTableLink).toHaveText(TARGET_TABLE);

      // run the transform and verify the table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(CUSTOM_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      // The link's inner span intercepts the pointer (upstream used realHover,
      // which is coordinate-based and does not run actionability checks).
      await getSchemaLink(page).hover({ force: true });
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText(CUSTOM_SCHEMA, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be able to create a new table in an existing transform when saving a transform", async ({
      page,
    }) => {
      // ENVIRONMENT-BLOCKED, not port drift and not a product bug.
      //
      // The save-transform modal defaults its Schema field to the database's
      // FIRST schema, not to the source table's schema. Measured directly on
      // the jar: with the source picked as "Schema A"."Animals" (confirmed via
      // the compiled SQL preview), the modal's Schema input reads "Domestic".
      // "Domestic" is not part of this spec's fixture — it belongs to
      // embedding-hub / interactive-embedding's `multi_schema` fixture, and it
      // sorts before "Schema A". CI gives each spec a fresh writable postgres
      // container so upstream never sees it; the local `writable_db` is shared
      // by all five slots and accumulates every spec's fixtures.
      //
      // The cure is a per-slot writable DB (or a "drop everything not mine"
      // reset). Dropping another spec's schema from here would break whichever
      // sibling agent is mid-run, so this stays fixme'd rather than "fixed".
      test.fixme();

      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();
      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "MBQL transform");
      await clearAndType(tableNameField(dialog), TARGET_TABLE);
      const created = waitForCreateTransform(page);
      await button(dialog, "Save").click();
      await created;

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      const inactiveTableLink = await getTableLink(page, { isActive: false });
      await expect(inactiveTableLink).toHaveText(TARGET_TABLE);

      // run the transform and verify the table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      await (await getTableLink(page)).click();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should not be possible to create an MBQL transform from a table from an unsupported database", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      const picker = miniPicker(page);
      // no sample db in mini picker
      await expect(picker.getByText(/Writable Postgres/)).toBeVisible();
      await expect(
        picker.getByText("Sample Database", { exact: true }),
      ).toHaveCount(0);

      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 0, "Databases").click();
      const sampleDbItem = pickerItemLink(page, /Sample Database/);
      await expect(sampleDbItem).toHaveAttribute("data-disabled", "true");
      await expect(
        pickerItemLink(page, /Writable Postgres/),
      ).not.toHaveAttribute("data-disabled");

      // Should show a tooltip explaining why the database is disabled
      await sampleDbItem.hover();
      await expect(tooltip(page).first()).toContainText(
        "Transforms can't be enabled on the Sample Database.",
      );
    });

    test("should not be possible to create an MBQL transform from metrics", async ({
      page,
      mb,
    }) => {
      const tableId = await getTableId(mb.api, {
        name: "Animals",
        databaseId: WRITABLE_DB_ID,
      });
      await createQuestion(mb.api, {
        name: "Animal Metric",
        type: "metric",
        query: {
          "source-table": tableId,
          aggregation: [["count"]],
        },
      });

      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      const picker = miniPicker(page);
      await picker.getByText("Our analytics", { exact: true }).click();
      // Anchor: the collection level has rendered (the header shows the
      // collection) before asserting no metric row exists.
      await expect(miniPickerHeader(page)).toContainText("Our analytics");
      await expect(picker.getByText(/metric/i)).toHaveCount(0);

      await miniPickerHeader(page).click(); // go back
      await miniPickerBrowseAll(page).click();
      await entityPickerModal(page)
        .getByText("Our analytics", { exact: true })
        .click();
      await expect(pickerItemLink(page, /Animal Metric/)).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });

    test("should not be possible to create a sql transform from a table from an unsupported database", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();

      await popover(page).getByText("SQL query", { exact: true }).click();

      await page
        .getByTestId("gui-builder-data")
        .getByText("Writable Postgres12", { exact: true })
        .click();

      const sampleOption = popover(page).getByRole("option", {
        name: "Sample Database",
        exact: true,
      });
      await expect(sampleOption).toHaveAttribute("aria-disabled", "true");
      await sampleOption.click({ force: true });

      // Clicking the disabled item does not close the popover
      await expect(popover(page)).toBeVisible();

      // Should show a tooltip explaining why the database is disabled
      await sampleOption.hover({ force: true });
      await expect(tooltip(page).first()).toContainText(
        "Transforms can't be enabled on the Sample Database.",
      );
    });

    test("not show the 'Show details' buttons in ID columns (metabase#64473)", async ({
      page,
      mb,
    }) => {
      const databaseId = WRITABLE_DB_ID;
      const sourceTable = SOURCE_TABLE;
      const nameColumn = "name";
      // DEVIATION forced by container contamination, measured not assumed.
      // Upstream leaves this lookup unpinned (passing `sourceTable` explicitly
      // takes createMbqlTransform's "custom source table" branch, which does
      // NOT pin a schema). In a clean container that is harmless — every
      // `many_schemas` "Animals" is identical. The shared local writable_db
      // also holds `Domestic"."Animals` from embedding-hub's `multi_schema`
      // fixture, and that one has **0 rows** (verified by querying the
      // container). When it wins the lookup the query returns "No results" and
      // upstream's `detail-shortcut` absence assertion passes VACUOUSLY.
      // Pinning to Schema A is what upstream itself does everywhere else in
      // this file and is a no-op on a clean container.
      const sourceSchema = TARGET_SCHEMA;

      const tableId = await getTableId(mb.api, {
        databaseId,
        name: sourceTable,
        schema: sourceSchema,
      });
      const fields = (await (
        await mb.api.get(`/api/table/${tableId}/query_metadata`)
      ).json()) as { fields: { id: number; name: string }[] };
      const nameColumnId = fields.fields.find(
        (field) => field.name === nameColumn,
      )?.id;
      // Make name a key
      await mb.api.put(`/api/field/${nameColumnId}`, {
        semantic_type: "type/PK",
      });

      const transform = await createMbqlTransform(mb.api, {
        databaseId,
        sourceTable,
        sourceSchema,
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);

      await DataStudio.Transforms.clickEditDefinition(page);

      const editor = getQueryEditor(page);
      // Anchor on the query response, not just on the loading indicator: a
      // `toHaveCount(0)` on the indicator is satisfied by "it has not appeared
      // yet" (measured — this test failed 1-in-2 under --repeat-each with only
      // the indicator gating it).
      const dataset = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await editor.getByTestId("run-button").first().click();
      await dataset;
      await expect(editor.getByTestId("loading-indicator")).toHaveCount(0);
      // Anchor: the results grid has painted, so the absence of the detail
      // shortcut below is a real observation and not read off an empty pane.
      await expect(editor.getByTestId("cell-data").first()).toBeVisible();
      await expect(editor.getByTestId("detail-shortcut")).toHaveCount(0);
    });

    test("should not be possible to create a transform from a question or a model that is based of an unsupported database", async ({
      page,
      mb,
    }) => {
      const testCardSource = async (type: "question" | "model") => {
        // create a query in the target database
        await createQuestion(mb.api, {
          name: `Test ${type}`,
          type,
          database: SAMPLE_DB_ID,
          query: { "source-table": ORDERS_ID },
        });

        // create a new transform
        await visitTransformListPage(page);
        await button(page, "Create a transform").click();
        await popover(page)
          .getByText("Copy of a saved question", { exact: true })
          .click();
        const pickerModal = entityPickerModal(page);
        await pickerModal.getByText("Our analytics", { exact: true }).click();
        await expect(
          pickerModal
            .getByText(`Test ${type}`, { exact: true })
            .locator("xpath=ancestor-or-self::a[1]"),
        ).toHaveAttribute("data-disabled", "true");
      };

      await testCardSource("question");
      await testCardSource("model");
    });

    test("should not auto-pivot query results for MBQL transforms", async ({
      page,
    }) => {
      // create a new transform
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      // build a query with 1 aggregation and 2 breakouts
      await pickWritableAnimals(page);
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
      await popover(page).getByText("Count of rows", { exact: true }).click();
      await getNotebookStep(page, "summarize")
        .getByText("Pick a column to group by", { exact: true })
        .click();
      await popover(page).getByText("Name", { exact: true }).click();
      await icon(
        getNotebookStep(page, "summarize").getByTestId("breakout-step"),
        "add",
      ).click();
      await popover(page).getByText("Score", { exact: true }).click();
      await page.getByTestId("run-button-overlay").click();

      // verify that no pivoting is applied
      const header = page.getByTestId("table-header");
      await expect(header.getByText("Name", { exact: true })).toBeVisible();
      await expect(header.getByText(/Score/)).toBeVisible();
      await expect(header.getByText("Count", { exact: true })).toBeVisible();
    });

    test("should show the metabot button", async ({ page, mb }) => {
      await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();
      await expect(
        page.getByRole("button", { name: /Chat with Metabot/ }),
      ).toBeVisible();
    });
  });

  test.describe("name", () => {
    test("should be able to edit the name after creation", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      const header = DataStudio.Transforms.header(page);
      const name = header.getByPlaceholder("Name");
      await name.click();
      await name.fill("");
      await name.pressSequentially("New name");
      await name.blur();

      await expectUndoToast(page, "Transform name updated");
      await expect(header.getByPlaceholder("Name")).toHaveValue("New name");
    });
  });

  test.describe("ownership", () => {
    test("should be able to view and manage transform ownership", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      // verify the ownership section is displayed
      const target = getTransformsTargetContent(page);
      await expect(target.getByText("Ownership", { exact: true })).toBeVisible();
      await expect(
        target.getByText("Specify who is responsible for this transform.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(target.getByText("Owner", { exact: true })).toBeVisible();

      // change the owner to another user
      let updated = waitForUpdateTransform(page);
      await target.getByLabel("Owner").click();
      await popover(page).getByText("Robert Tableton", { exact: true }).click();
      await updated;
      await expectUndoToast(page, "Transform owner updated");
      await icon(undoToast(page).first(), "close").click();

      // set an external email as owner
      updated = waitForUpdateTransform(page);
      await target.getByLabel("Owner").click();
      const owner = target.getByLabel("Owner");
      await owner.fill("");
      await owner.pressSequentially("external@example.com");
      await popover(page)
        .getByText("external@example.com", { exact: true })
        .click();
      await updated;
      await expectUndoToast(page, "Transform owner updated");
      await icon(undoToast(page).first(), "close").click();

      // clear the owner
      updated = waitForUpdateTransform(page);
      await target.getByLabel("Owner").click();
      await popover(page).getByText("No owner", { exact: true }).click();
      await updated;
      await expectUndoToast(page, "Transform owner updated");
    });
  });

  test.describe("tags", () => {
    test("should be able to add and remove tags", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();

      let updated = waitForUpdateTransform(page);
      await popover(page).getByText("hourly", { exact: true }).click();
      await updated;
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_tags_updated",
        triggered_from: "transform_run_page",
        event_detail: "tag_added",
        target_id: 1,
        result: "success",
      });

      await assertOptionSelected(page, "hourly");
      await assertOptionNotSelected(page, "daily");

      updated = waitForUpdateTransform(page);
      await popover(page).getByText("daily", { exact: true }).click();
      await updated;
      await assertOptionSelected(page, "hourly");
      await assertOptionSelected(page, "daily");

      updated = waitForUpdateTransform(page);
      // cy.type("{backspace}") clicks its subject first, then sends the key.
      await getTagsInput(page).click();
      await getTagsInput(page).press("Backspace");
      await updated;
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_tags_updated",
        triggered_from: "transform_run_page",
        event_detail: "tag_removed",
        target_id: 1,
        result: "success",
      });

      await assertOptionSelected(page, "hourly");
      await assertOptionNotSelected(page, "daily");
    });

    test("should be able to create tags inline", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();
      await getTagsInput(page).pressSequentially("New tag");
      const created = waitForCreateTag(page);
      await popover(page).getByText("New tag", { exact: true }).click();
      await created;
      await expectUndoToast(page, "Transform tags updated");
    });

    test("should be able to update tags inline", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();
      await tagRowAction(page, "hourly", "Rename tag").click({ force: true });

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "daily_changed");
      const updated = waitForUpdateTag(page);
      await button(dialog, "Save").click();
      await updated;

      await getTagsInput(page).click();
      await expect(
        popover(page).getByText("daily_changed", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to delete tags inline", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();
      await tagRowAction(page, "hourly", "Delete tag").click({ force: true });

      const deleted = waitForDeleteTag(page);
      await button(modal(page), "Delete tag").click();
      await deleted;
      await expectUndoToast(page, "Transform tags updated");

      await getTagsInput(page).click();
      // Anchored on "daily" being present, so the "hourly" absence is a real
      // observation of a rendered list rather than of an unmounted one.
      await expect(
        popover(page).getByText("daily", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("hourly", { exact: true }),
      ).toHaveCount(0);
    });

    test("should update tags on all transforms when deleting them from another transform", async ({
      page,
      mb,
    }) => {
      await createMbqlTransform(mb.api, { name: "Transform B" });
      const transformA = await createMbqlTransform(mb.api, {
        name: "Transform A",
        targetTable: TARGET_TABLE_2,
      });
      await DataStudio.Transforms.visitTransform(page, transformA.id);

      // Add new tag to transform A
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();
      await getTagsInput(page).pressSequentially("New tag");
      const created = waitForCreateTag(page);
      await popover(page).getByText("New tag", { exact: true }).click();
      await created;

      // Navigate to transform B
      await getTransformsNavLink(page).click();
      await page
        .getByRole("treegrid")
        .getByText("Transform B", { exact: true })
        .click();

      // Remove the new tag from transform B
      await DataStudio.Transforms.runTab(page).click();
      await getTagsInput(page).click();
      await tagRowAction(page, "New tag", "Delete tag").click({ force: true });
      const deleted = waitForDeleteTag(page);
      await button(modal(page), "Delete tag").click();
      await deleted;

      // Navigate to transform A
      await getTransformsNavLink(page).click();
      await page
        .getByRole("treegrid")
        .getByText("Transform A", { exact: true })
        .click();

      // The tag should be gone.
      // NOTE: upstream writes `getTagsInput().parent().get("[data-with-remove=true]")`
      // — `cy.get()` RESETS the subject (PORTING), so the `.parent()` scope is
      // dead code and the real selector is the bare attribute, page-wide.
      // Ported as what actually executes, anchored on the tags input being
      // rendered so the absence is not read off an unmounted page.
      await DataStudio.Transforms.runTab(page).click();
      await expect(getTagsInput(page)).toBeVisible();
      await expect(page.locator("[data-with-remove=true]")).toHaveCount(0);
    });
  });

  test.describe("incremental settings inline editing", () => {
    test("should update incremental settings inline when toggling the switch", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      // Toggle incremental on
      await isIncrementalSwitchDisabled(page);
      let updated = waitForUpdateTransform(page);
      await getIncrementalSwitch(page).click();
      await updated;
      await isIncrementalSwitchEnabled(page);
      await expectUndoToast(
        page,
        "Incremental transformation settings updated",
      );

      // Toggle incremental off
      updated = waitForUpdateTransform(page);
      await getIncrementalSwitch(page).click();
      await updated;
      await isIncrementalSwitchDisabled(page);
      await expectUndoToast(
        page,
        "Incremental transformation settings updated",
      );
    });

    test("should debounce inline updates and not make a request when toggling the same field twice", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      // Toggle incremental on and immediately off
      await isIncrementalSwitchDisabled(page);

      // Port of the counting cy.intercept: a passive request counter (PORTING —
      // "assert a request never fired" becomes a page.on counter checked at the
      // end), so nothing is stubbed and the app runs exactly as it would.
      let updateCallCount = 0;
      page.on("request", (request) => {
        if (
          request.method() === "PUT" &&
          /^\/api\/transform\/[^/]+$/.test(new URL(request.url()).pathname)
        ) {
          updateCallCount++;
        }
      });

      // Toggle on then immediately off (within the 300ms debounce window)
      await getIncrementalSwitch(page).click();
      await getIncrementalSwitch(page).click();

      // Wait for the debounce period (300ms) plus some buffer
      await page.waitForTimeout(500);

      // The switch should be back to unchecked, and no request should have
      // been made since we toggled back to the original value.
      await isIncrementalSwitchDisabled(page);
      expect(updateCallCount).toBe(0);
    });

    test("should handle sequential changes correctly when first update is in progress", async ({
      page,
      mb,
    }) => {
      // composite_pk_table has at least two numeric fields (id1, score) so a
      // second checkpoint field can reliably be selected.
      await resetCompositePkTable();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["composite_pk_table"],
      });
      const transform = await createMbqlTransform(mb.api, {
        sourceTable: "composite_pk_table",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      await isIncrementalSwitchDisabled(page);

      let requestCount = 0;
      // Port of the delaying cy.intercept. `res.setThrottle` has no Playwright
      // equivalent (PORTING); a route delay is the documented stand-in. The
      // first PUT is held for 1s so the second change lands while it is in
      // flight; later ones pass through untouched.
      await page.route(
        (url) => /^\/api\/transform\/[^/]+$/.test(url.pathname),
        async (route) => {
          if (route.request().method() !== "PUT") {
            return route.fallback();
          }
          requestCount++;
          if (requestCount === 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          await route.continue();
        },
      );

      const updates = countResponses(
        page,
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/transform\/[^/]+$/.test(new URL(response.url()).pathname),
      );

      // Toggle incremental on (first change)
      await getIncrementalSwitch(page).click();

      // Wait for the first request to start (debounce 300ms + buffer), then
      // make a second change while it is still in progress.
      await page.waitForTimeout(400);
      await getFieldPicker(page).scrollIntoViewIfNeeded();
      await expect(getFieldPicker(page)).toBeVisible();
      await getFieldPicker(page).click();
      await popover(page).getByRole("option").nth(1).click();

      // Wait for both requests to complete (upstream: two cy.waits on the same
      // alias — ported as a counter, since concurrent waitForResponses on one
      // predicate all resolve on the first hit).
      await expect
        .poll(() => updates(), { timeout: 20_000 })
        .toBeGreaterThanOrEqual(2);

      // Verify final state — incremental on with a checkpoint field selected
      await isIncrementalSwitchEnabled(page);
      await expect(getFieldPicker(page)).not.toContainText("Pick a field");

      expect(requestCount).toBe(2);
    });

    test("should update source strategy and checkpoint field inline", async ({
      page,
      mb,
    }) => {
      await resetCompositePkTable();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["composite_pk_table"],
      });
      const transform = await createMbqlTransform(mb.api, {
        sourceTable: "composite_pk_table",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      // Enable incremental transformation
      let updated = waitForUpdateTransform(page);
      await getIncrementalSwitch(page).click();
      await updated;

      // The checkpoint field select should be visible
      await getFieldPicker(page).scrollIntoViewIfNeeded();
      await expect(getFieldPicker(page)).toBeVisible();

      // Select a checkpoint field
      updated = waitForUpdateTransform(page);
      await getFieldPicker(page).click();
      await popover(page).getByRole("option").nth(1).click();
      await updated;
      await expectUndoToast(
        page,
        "Incremental transformation settings updated",
      );

      await expect(getFieldPicker(page)).not.toContainText("Pick a field");
    });

    test("should rollback values when API returns an error", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      await isIncrementalSwitchDisabled(page);

      // Intercept and force the update to fail
      await page.route(
        (url) => /^\/api\/transform\/[^/]+$/.test(url.pathname),
        async (route) => {
          if (route.request().method() !== "PUT") {
            return route.fallback();
          }
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Internal server error" }),
          });
        },
      );

      const failed = waitForUpdateTransform(page);
      await getIncrementalSwitch(page).click();
      await failed;

      await expectUndoToast(
        page,
        "Failed to update incremental transformation settings",
      );
      // The switch rolled back to the unchecked state
      await isIncrementalSwitchDisabled(page);
    });

    test("should rollback values when network fails", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      await isIncrementalSwitchDisabled(page);

      // Port of cy.intercept({ forceNetworkError: true }): abort the request.
      await page.route(
        (url) => /^\/api\/transform\/[^/]+$/.test(url.pathname),
        async (route) => {
          if (route.request().method() !== "PUT") {
            return route.fallback();
          }
          await route.abort("failed");
        },
      );

      await getIncrementalSwitch(page).click();

      await expectUndoToast(
        page,
        "Failed to update incremental transformation settings",
      );
      await isIncrementalSwitchDisabled(page);
    });

    test("should not process pending updates after an error occurs", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();

      await isIncrementalSwitchDisabled(page);

      let requestCount = 0;
      // The first PUT fails after a delay, so the second change happens while
      // it is in progress; subsequent ones would pass through (they must not
      // happen — that is the assertion).
      await page.route(
        (url) => /^\/api\/transform\/[^/]+$/.test(url.pathname),
        async (route) => {
          if (route.request().method() !== "PUT") {
            return route.fallback();
          }
          requestCount++;
          if (requestCount === 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ message: "Internal server error" }),
            });
          }
          await route.continue();
        },
      );

      // Toggle incremental on (first change)
      await getIncrementalSwitch(page).click();
      // Wait for the debounce, then toggle again (second change)
      await page.waitForTimeout(400);
      await getIncrementalSwitch(page).click();

      await expectUndoToast(
        page,
        "Failed to update incremental transformation settings",
      );
      // Wait a bit to ensure no second request is made
      await page.waitForTimeout(500);
      expect(requestCount).toBe(1);

      await isIncrementalSwitchDisabled(page);
    });
  });

  test.describe("targets", () => {
    test("should be able to change the target before running a transform", async ({
      page,
      mb,
    }) => {
      // create but do not run the transform
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // modify the transform before running
      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      const dialog = modal(page);
      await expect(newTableNameField(dialog)).toHaveValue(TARGET_TABLE);
      await expect(schemaField(dialog)).toHaveValue(TARGET_SCHEMA);
      await clearAndType(newTableNameField(dialog), TARGET_TABLE_2);
      await schemaField(dialog).click();
      await popover(page).getByText(TARGET_SCHEMA_2, { exact: true }).click();
      const updated = waitForUpdateTransform(page);
      await button(modal(page), "Change target").click();
      await updated;

      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA_2);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      await expect(await getTableLink(page, { isActive: false })).toHaveText(
        TARGET_TABLE_2,
      );

      // run the transform and verify the table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA_2);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      const tableLink = await getTableLink(page);
      await expect(tableLink).toHaveText(TARGET_TABLE_2);
      await tableLink.click();
      await expect(
        queryBuilderHeader(page).getByText(TARGET_SCHEMA_2, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be possible to create a new schema", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      const dialog = modal(page);
      await expect(newTableNameField(dialog)).toHaveValue(TARGET_TABLE);
      await expect(schemaField(dialog)).toHaveValue(TARGET_SCHEMA);
      await clearAndType(newTableNameField(dialog), TARGET_TABLE_2);
      await clearAndType(schemaField(dialog), CUSTOM_SCHEMA);
      await popover(page).getByText(/Create new schema/).click();
      const updated = waitForUpdateTransform(page);
      await button(modal(page), "Change target").click();
      await updated;

      await expect(getSchemaLink(page)).toHaveText(CUSTOM_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute("aria-disabled", "true");
      await expect(await getTableLink(page, { isActive: false })).toHaveText(
        TARGET_TABLE_2,
      );

      // run the transform and verify the table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(CUSTOM_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      const tableLink = await getTableLink(page);
      await expect(tableLink).toHaveText(TARGET_TABLE_2);
      await tableLink.click();
      await expect(
        queryBuilderHeader(page).getByText(CUSTOM_SCHEMA, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be able to change the target after running a transform and keep the old target", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      // modify the transform after running
      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      const dialog = modal(page);
      await expect(newTableNameField(dialog)).toHaveValue(TARGET_TABLE);
      await expect(schemaField(dialog)).toHaveValue(TARGET_SCHEMA);
      await expect(dialog.getByLabel(`Keep ${TARGET_TABLE}`)).toBeChecked();
      await clearAndType(newTableNameField(dialog), TARGET_TABLE_2);
      const updated = waitForUpdateTransform(page);
      await button(dialog, "Change target").click();
      await updated;

      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      await expect(getSchemaLink(page)).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      await expect(await getTableLink(page, { isActive: false })).toHaveText(
        TARGET_TABLE_2,
      );

      // run the transform and verify the new table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      const tableLink = await getTableLink(page);
      await expect(tableLink).toHaveText(TARGET_TABLE_2);
      await tableLink.click();
      await expect(
        queryBuilderHeader(page).getByText("Transform Table 2", { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);

      // verify that the original question still works
      await visitTableQuestion(page, mb.api);
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be able to change the target after running a transform and delete the old target", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      const dialog = modal(page);
      await expect(newTableNameField(dialog)).toHaveValue(TARGET_TABLE);
      await expect(schemaField(dialog)).toHaveValue(TARGET_SCHEMA);
      await clearAndType(newTableNameField(dialog), TARGET_TABLE_2);
      await dialog.getByLabel(`Delete ${TARGET_TABLE}`).click();
      const tableDeleted = waitForDeleteTransformTable(page);
      const updated = waitForUpdateTransform(page);
      await button(dialog, "Change target and delete old table").click();
      await tableDeleted;
      await updated;

      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      await expect(await getTableLink(page, { isActive: false })).toHaveText(
        TARGET_TABLE_2,
      );

      // run the transform and verify the new table
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      const tableLink = await getTableLink(page);
      await expect(tableLink).toHaveText(TARGET_TABLE_2);
      await tableLink.click();
      await expect(
        queryBuilderHeader(page).getByText("Transform Table 2", { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);

      // verify that the original question does not work
      await visitTableQuestion(page, mb.api);
      await assertTableDoesNotExistError(page);
    });

    test("should be able to delete the target and restore the same target back", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      // delete the old target without creating the new one
      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      let dialog = modal(page);
      await clearAndType(newTableNameField(dialog), TARGET_TABLE_2);
      await dialog.getByLabel(`Delete ${TARGET_TABLE}`).click();
      const tableDeleted = waitForDeleteTransformTable(page);
      let updated = waitForUpdateTransform(page);
      await button(dialog, "Change target and delete old table").click();
      await tableDeleted;
      await updated;

      // change the target back to the original one
      await button(getTransformsTargetContent(page), "Change target").click();
      dialog = modal(page);
      await clearAndType(newTableNameField(dialog), TARGET_TABLE);
      updated = waitForUpdateTransform(page);
      await button(dialog, "Change target").click();
      await updated;

      // run the transform to re-create the original target
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      // verify the target is available
      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText("Transform Table", { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should not allow to overwrite an existing table when changing the target", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // change the target to an existing table
      await DataStudio.Transforms.settingsTab(page).click();
      await button(getTransformsTargetContent(page), "Change target").click();
      const dialog = modal(page);
      await clearAndType(newTableNameField(dialog), SOURCE_TABLE);
      const updated = waitForUpdateTransform(page);
      await button(dialog, "Change target").click();
      await updated;
      await expect(
        dialog.getByText("A table with that name already exists.", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("metadata", () => {
    test("should be able to edit table metadata after table creation", async ({
      page,
      mb,
    }) => {
      // before table creation
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();
      // Anchored on the target panel having rendered (the "Change target"
      // button), so the absence below is read off a painted page.
      await expect(
        button(getTransformsTargetContent(page), "Change target"),
      ).toBeVisible();
      await expect(
        getTransformsTargetContent(page).getByText(
          "Edit this table's metadata",
          { exact: true },
        ),
      ).toHaveCount(0);

      // after table creation
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await getTransformsTargetContent(page)
        .getByText("Edit this table's metadata", { exact: true })
        .click();
      await TableSection.clickFieldsTab(page);
      await TableSection.clickField(page, "Name");
      const nameInput = FieldSection.get(page).getByPlaceholder(
        "Give this field a name",
        { exact: true },
      );
      await nameInput.click();
      await nameInput.fill("");
      await nameInput.pressSequentially("New name");
      const fieldUpdated = waitForUpdateField(page);
      await nameInput.blur();
      await fieldUpdated;

      // verify query metadata
      await page.goBack();
      await page.goBack();
      await page.goBack();
      await (await getTableLink(page)).click();
      await assertTableData(page, { columns: ["New name", "Score"] });
    });

    test("should be able to see the target schema", async ({ page, mb }) => {
      // before table creation
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getSchemaLink(page)).toHaveText(TARGET_SCHEMA);
      await getSchemaLink(page).click();
      await expect(
        main(page).getByText("Animals", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Transform Table", { exact: true }),
      ).toHaveCount(0);

      // after table creation
      await page.goBack();
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await getSchemaLink(page).click();
      await expect(
        main(page).getByText("Animals", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Transform Table", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to see the target database", async ({ page, mb }) => {
      // before table creation
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.settingsTab(page).click();
      await expect(getDatabaseLink(page)).toHaveText(DB_NAME);
      await getDatabaseLink(page).click();
      await expect(
        main(page).getByText(TARGET_SCHEMA, { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText(TARGET_SCHEMA_2, { exact: true }),
      ).toBeVisible();

      // after table creation
      await page.goBack();
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await getDatabaseLink(page).click();
      await expect(
        main(page).getByText(TARGET_SCHEMA, { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText(TARGET_SCHEMA_2, { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("queries", () => {
    test("should show SQL query transforms in view-only mode", async ({
      page,
      mb,
    }) => {
      const transform = await createSqlTransform(mb.api, {
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await expect(nativeEditor(page)).toHaveAttribute(
        "contenteditable",
        "false",
      );
      await expect(nativeEditor(page)).toHaveAttribute("aria-readonly", "true");
      await expect(
        DataStudio.Transforms.editDefinitionButton(page),
      ).toHaveAttribute("href", `/data-studio/transforms/${transform.id}/edit`);
    });

    test("should show MBQL transforms in view-only mode", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await expect(
        getNotebookStep(page, "data")
          .getByText("Animals", { exact: true })
          .locator("xpath=ancestor-or-self::button[1]"),
      ).toBeDisabled();
      await expect(
        DataStudio.Transforms.editDefinitionButton(page),
      ).toHaveAttribute("href", `/data-studio/transforms/${transform.id}/edit`);
    });

    test("should be able to update a MBQL query", async ({ page, mb }) => {
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // visit edit mode
      await DataStudio.Transforms.clickEditDefinition(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/edit");

      // update the query
      await button(getNotebookStep(page, "data"), "Filter").click();
      await popover(page).getByText("Name", { exact: true }).click();
      await popover(page).getByText("Duck", { exact: true }).click();
      await button(popover(page), "Add filter").click();

      const updated = waitForUpdateTransform(page);
      await button(getQueryEditor(page), "Save").click();
      await updated;

      // run the transform and make sure the query has changed
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText(DB_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should be able to update a SQL query", async ({ page, mb }) => {
      const transform = await createSqlTransform(mb.api, {
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // visit edit mode
      await DataStudio.Transforms.clickEditDefinition(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/edit");

      // update the query
      await typeInNativeEditor(page, " WHERE name = \'Duck\'");
      const updated = waitForUpdateTransform(page);
      await button(getQueryEditor(page), "Save").click();
      await updated;

      // run the transform and make sure the query has changed
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await (await getTableLink(page)).click();
      await expect(
        queryBuilderHeader(page).getByText(DB_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 1);
    });

    test("should be able to update a Python query", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
    });

    test("should show Python transforms in view-only mode", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
    });

    test("should transition from read-only to edit mode for Python transforms", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
    });

    test("should return to read-only mode after saving a Python transform", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
    });
  });

  test.describe("runs", () => {
    test("should be able to navigate to a list of runs", async ({
      page,
      mb,
    }) => {
      // create and run a transform
      const mbql = await createMbqlTransform(mb.api, {
        targetTable: TARGET_TABLE,
      });
      await DataStudio.Transforms.visitTransform(page, mbql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      // create and run another transform
      const sql = await createSqlTransform(mb.api, {
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
      });
      await DataStudio.Transforms.visitTransform(page, sql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      // assert that the list is filtered by the current transform
      await getRunListLink(page).click();
      const runs = getTransformRunTable(page);
      await expect(
        runs.getByText("SQL transform", { exact: true }),
      ).toBeVisible();
      await expect(
        runs.getByText("MBQL transform", { exact: true }),
      ).toHaveCount(0);
      await expect(runs.getByText("Success", { exact: true })).toBeVisible();
      await expect(runs.getByText("Manual", { exact: true })).toBeVisible();
    });

    test("should display the error message from a failed run", async ({
      page,
      mb,
    }) => {
      const transform = await createSqlTransform(mb.api, {
        sourceQuery: "SELECT * FROM abc",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForFailure(page);
      await getRunErrorInfoButton(page).click();
      await expect(modal(page)).toContainText('relation "abc" does not exist');
    });
  });

  test.describe("deletion", () => {
    test("should be able to delete a transform before creating the table", async ({
      page,
      mb,
    }) => {
      // create a transform without running
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // delete the transform
      await icon(DataStudio.Transforms.header(page), "ellipsis").click();
      await popover(page).getByText("Delete", { exact: true }).click();
      const dialog = modal(page);
      // Anchored on the confirm button, so the two absences below are read off
      // a rendered modal (upstream's `.within()` on a findByTestId carries the
      // same implicit existence requirement).
      await expect(button(dialog, "Delete transform")).toBeVisible();
      await expect(
        dialog.getByLabel("Delete the transform only", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByLabel("Delete the transform and the table", {
          exact: true,
        }),
      ).toHaveCount(0);
      const deleted = waitForDeleteTransform(page);
      await button(dialog, "Delete transform").click();
      await deleted;

      await getTransformsNavLink(page).click();
      await expect(getTransformsList(page)).toBeVisible();
      await expect(
        getTransformsList(page).getByText("MBQL transform", { exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to delete a transform and keep the table", async ({
      page,
      mb,
    }) => {
      // create a transform and the table
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await getTableLink(page);

      // delete the transform but keep the table
      await icon(DataStudio.Transforms.header(page), "ellipsis").click();
      await popover(page).getByText("Delete", { exact: true }).click();
      const dialog = modal(page);
      await expect(
        dialog.getByLabel("Delete the transform only", { exact: true }),
      ).toBeChecked();
      const deleted = waitForDeleteTransform(page);
      await button(dialog, "Delete transform only").click();
      await deleted;
      await expect(getTransformsList(page)).toBeVisible();

      // make sure the table still exists
      await visitTableQuestion(page, mb.api);
      await assertQueryBuilderRowCount(page, 3);
    });

    test("should be able to delete a transform and delete the table", async ({
      page,
      mb,
    }) => {
      // create a transform and the table
      const transform = await createMbqlTransform(mb.api, {});
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);
      await DataStudio.Transforms.settingsTab(page).click();
      await getTableLink(page);

      // delete the transform and the table
      await icon(DataStudio.Transforms.header(page), "ellipsis").click();
      await popover(page).getByText("Delete", { exact: true }).click();
      const dialog = modal(page);
      await dialog
        .getByLabel("Delete the transform and the table", { exact: true })
        .click();
      const tableDeleted = waitForDeleteTransformTable(page);
      const deleted = waitForDeleteTransform(page);
      await button(dialog, "Delete transform and table").click();
      await tableDeleted;
      await deleted;
      await expect(getTransformsList(page)).toBeVisible();

      // make sure the table is deleted
      await visitTableQuestion(page, mb.api);
      await assertTableDoesNotExistError(page);
    });
  });

  test.describe("disconnected database", () => {
    test("should warn about transforms when deleting a database and show disconnected banner on transform pages", async ({
      page,
      mb,
    }) => {
      // create a transform
      const transform = await createMbqlTransform(mb.api, {});

      // go to admin and delete the writable database
      const usageInfo = waitForApi(
        page,
        "GET",
        /^\/api\/database\/\d+\/usage_info$/,
      );
      await page.goto(`/admin/databases/${WRITABLE_DB_ID}`);
      await button(page, "Remove this database").click();
      await usageInfo;

      // verify the delete modal warns about transforms that will stop working
      const dialog = modal(page);
      const warning = dialog.getByLabel(/1 transform will stop working/);
      await expect(warning).not.toBeChecked();
      await warning.click();
      await expect(warning).toBeChecked();
      await dialog
        .getByTestId("database-name-confirmation-input")
        .pressSequentially(DB_NAME);
      const deleteDb = waitForApi(page, "DELETE", /^\/api\/database\/\d+$/);
      await dialog
        .getByText("Delete this DB connection", { exact: true })
        .click();
      await deleteDb;

      // visit the transform query page and verify the disconnected banner
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await verifyDisconnectedDatabaseBanner(page);

      // edit definition button should not be visible
      await expect(
        DataStudio.Transforms.editDefinitionButton(page),
      ).toHaveCount(0);

      // visit the run page and verify the disconnected banner is visible
      await DataStudio.Transforms.runTab(page).click();
      await verifyDisconnectedDatabaseBanner(page);

      // visit the settings page and verify the disconnected banner is visible
      await DataStudio.Transforms.settingsTab(page).click();
      await verifyDisconnectedDatabaseBanner(page);

      // visit the inspect page and verify the disconnected banner is visible
      await DataStudio.Transforms.inspectTab(page).click();
      await verifyDisconnectedDatabaseBanner(page);

      // visit the dependencies page and verify the disconnected banner is
      // visible
      await DataStudio.Transforms.dependenciesTab(page).click();
      await verifyDisconnectedDatabaseBanner(page);
    });
  });

  test.describe("cancelation", () => {
    /** Port of the describe-local createSlowTransform(seconds). */
    async function createSlowTransform(
      api: import("../support/api").MetabaseApi,
      seconds = 100,
    ) {
      return createTransform(api, {
        name: "Slow transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "native",
            native: {
              query: `SELECT name, cast(pg_sleep(${seconds}) as text) as slow FROM "Schema A"."Animals" LIMIT 1`,
            },
          },
        },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: TARGET_TABLE,
          schema: TARGET_SCHEMA,
        },
        tag_ids: [],
      });
    }

    test("should be possible to cancel a transform from the transform page", async ({
      page,
      mb,
    }) => {
      const transform = await createSlowTransform(mb.api);
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getRunButton(page).click();
      await expect(getRunButton(page)).toHaveText("Running now…");
      await expect(getRunStatus(page)).toHaveText("Run in progress…");

      await getCancelButton(page).click();
      await button(modal(page), "Yes").click();

      await expect(getRunButton(page)).toHaveText("Canceling…");
      await expect(getRunStatus(page)).toHaveText("Canceling…");

      // We need to pass a timeout here since canceling a transform can
      // take a while on the back end
      await expect(getRunButton(page)).toHaveText("Canceled", {
        timeout: 40_000,
      });
      await expect(getRunStatus(page)).toContainText("Last run was canceled");
    });

    test("should be possible to cancel a transform from the runs page", async ({
      page,
      mb,
    }) => {
      const transform = await createSlowTransform(mb.api);
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getRunButton(page).click();
      await expect(getRunButton(page)).toHaveText("Running now…");
      await expect(getRunStatus(page)).toHaveText("Run in progress…");

      await getRunsNavLink(page).click();
      await getTransformRunTable(page)
        .getByText("In progress", { exact: true })
        .click();
      await button(DataStudio.Runs.sidebar(page), "Cancel run").click();
      await button(modal(page), "Yes").click();

      await expect(
        getTransformRunTable(page).getByText("Canceling", { exact: true }),
      ).toBeAttached();
      await expect(
        getTransformRunTable(page).getByText("Canceled", { exact: true }),
      ).toBeAttached({ timeout: 30_000 });
    });

    test("should show a message when the run finished before it cancels", async ({
      page,
      mb,
    }) => {
      const transform = await createSlowTransform(mb.api, 1);
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.runTab(page).click();
      await getRunButton(page).click();
      await expect(getRunButton(page)).toHaveText("Running now…");
      await expect(getRunStatus(page)).toHaveText("Run in progress…");

      await getCancelButton(page).click();
      await button(modal(page), "Yes").click();

      await expect(getRunButton(page)).toHaveText("Canceling…");
      await expect(getRunStatus(page)).toHaveText("Canceling…");

      // We need to pass a timeout here since canceling a transform can
      // take a while on the back end
      await expect(getRunButton(page)).toHaveText("Ran successfully", {
        timeout: 40_000,
      });
      await expect(getRunStatus(page)).toContainText(
        "Last ran a few seconds ago successfully.",
      );
      await expect(DataStudio.Runs.content(page)).toContainText(
        "This run succeeded before it had a chance to cancel.",
      );
    });

    test("should be possible to cancel a SQL transform from the preview (metabase#64474)", async ({
      page,
      mb,
    }) => {
      const transform = await createSlowTransform(mb.api, 500);
      await DataStudio.Transforms.visitTransform(page, transform.id);

      await DataStudio.Transforms.clickEditDefinition(page);
      await expect.poll(() => new URL(page.url()).pathname).toContain("/edit");

      const editor = getQueryEditor(page);
      await editor.getByTestId("run-button").first().click();
      await expect(editor.getByTestId("loading-indicator")).toBeVisible();

      await editor.getByTestId("run-button").first().click();
      await expect(editor.getByTestId("loading-indicator")).toHaveCount(0);
    });
  });

  test.describe("dependencies", () => {
    test("should render the dependency graph", async ({ page, mb }) => {
      const transformA = await createMbqlTransform(mb.api, {
        name: "Transform A",
        targetTable: "table_a",
      });
      await DataStudio.Transforms.visitTransform(page, transformA.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      const transformB = await createMbqlTransform(mb.api, {
        name: "Transform B",
        sourceTable: "table_a",
        // `sourceSchema` pinned — the transform above writes table_a into
        // "Schema A", and an unpinned lookup on a shared writable_db can
        // resolve a same-named table from another spec's schema (measured
        // for "Animals" earlier in this port). No-op on a clean container.
        sourceSchema: TARGET_SCHEMA,
        targetTable: "table_b",
      });
      await DataStudio.Transforms.visitTransform(page, transformB.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      const transformC = await createMbqlTransform(mb.api, {
        name: "Transform C",
        sourceTable: "table_b",
        sourceSchema: TARGET_SCHEMA,
        targetTable: "table_c",
      });
      await DataStudio.Transforms.visitTransform(page, transformC.id);

      await waitForBackfillComplete(mb.api);
      await DataStudio.Transforms.dependenciesTab(page).click();
      await expect(DataStudio.Dependencies.content(page)).toContainText(
        "Transform B",
      );
      await expect(DataStudio.Dependencies.content(page)).toContainText(
        "Transform A",
      );
    });

    test("should show if the transform has no dependencies", async ({
      page,
      mb,
    }) => {
      const transform = await createMbqlTransform(mb.api, {
        name: "Transform A",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);
      await DataStudio.Transforms.dependenciesTab(page).click();
      await expect(DataStudio.Dependencies.content(page)).toContainText(
        "Nothing uses this",
      );
    });
  });

  /**
   * Upstream tags ALL FIVE of these `@python`. Measured here, that tag is
   * coarser than the actual requirement, and the difference is worth 3 tests:
   *
   *  - Only the two that call `H.setPythonRunnerSettings()` and then RUN a
   *    python transform need the python-runner (:5001) + localstack (:4566)
   *    containers. Both were probed and are dead (empty response), so those two
   *    stay gated on PW_PYTHON_RUNNER_ENABLED with unwritten bodies.
   *  - The other three only need the `transforms-python` token feature, which
   *    the beforeEach's `pro-self-hosted` token carries. Probed directly rather
   *    than assumed: `GET/PUT /api/ee/transforms-python/library/common.py` both
   *    return **200** on this backend. They are ported and executed.
   *
   * This also SETTLES the `402 Premium features required` the original brief
   * predicted for the python tier: it does not happen. `pro-self-hosted`
   * includes `transforms-python: true` (read off `/api/session/properties`),
   * and the library endpoints return 200. The previous session correctly
   * declined to repeat the 402 claim while leaving it unverified; it is now
   * verified as FALSE for these endpoints.
   */
  test.describe("python > common library", () => {
    test("should be possible to edit and save the common library", async ({
      page,
    }) => {
      await visitCommonLibrary(page);

      // updating the library should be possible.
      //
      // NOTE upstream types `return a + b` with NO leading indent and then
      // asserts the saved value HAS four spaces — the assertion is on
      // CodeMirror's python auto-indent, so this must be real keystrokes
      // (pressSequentially), never a paste.
      await clearPythonEditor(page);
      await typePythonEditor(
        page,
        "def useful_calculation(a, b):\nreturn a + b",
      );
      await getLibraryEditorHeader(page)
        .getByText("Save", { exact: true })
        .click();

      // the contents should be saved properly
      await visitCommonLibrary(page);
      await expect
        .poll(() => pythonEditorValue(page))
        .toBe("def useful_calculation(a, b):\n    return a + b");

      // reverting the changes should be possible
      await clearPythonEditor(page);
      await typePythonEditor(page, "# oops");
      await getLibraryEditorHeader(page)
        .getByText("Revert", { exact: true })
        .click();
      await expect
        .poll(() => pythonEditorValue(page))
        .toBe("def useful_calculation(a, b):\n    return a + b");
    });

    test("should be possible to use the common library", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
      // Needs H.setPythonRunnerSettings + a live runner; body unwritten because
      // it cannot be verified here (PORTING).
    });

    test("should navigate to the common library when clicking 'common' in an import statement", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Python script", { exact: true }).click();

      const token = page.locator(".cm-clickable-token");
      await expect(token).toBeVisible();
      await token.click();

      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();

      await expect(page).toHaveURL(
        /\/data-studio\/transforms\/library\/common\.py/,
      );
      await expect(getLibraryEditorHeader(page)).toBeVisible();
    });

    test("should open the common library in a new tab when cmd-clicking 'common' in an import statement", async ({
      page,
    }) => {
      await visitTransformListPage(page);

      // Port of `cy.window().then(win => cy.stub(win, "open").as("windowOpen"))`.
      // Patched after the visit, exactly as upstream patches it, and the calls
      // are recorded on the window for the assertion to read back.
      await page.evaluate(() => {
        const calls: string[] = [];
        (window as unknown as { __openCalls: string[] }).__openCalls = calls;
        window.open = ((url?: string | URL) => {
          calls.push(String(url ?? ""));
          return null;
        }) as typeof window.open;
      });

      await button(page, "Create a transform").click();
      await popover(page).getByText("Python script", { exact: true }).click();

      const token = page.locator(".cm-clickable-token");
      await expect(token).toBeVisible();
      // Port of `.click(H.holdMetaKey)` — { metaKey: true } on mac.
      await token.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });

      // Port of `should("have.been.calledWithMatch", "…/library/common.py")` —
      // calledWithMatch on a string argument is a SUBSTRING match in sinon.
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __openCalls: string[] }).__openCalls,
          ),
        )
        .toEqual(
          expect.arrayContaining([
            expect.stringContaining("/data-studio/transforms/library/common.py"),
          ]),
        );
    });

    test("should be able to run a transform with default import common even without custom library code", async () => {
      test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
      // Needs H.setPythonRunnerSettings + a live runner; body unwritten because
      // it cannot be verified here (PORTING).
    });
  });

  test.describe("collections", () => {
    test("should create collections and save transforms to them", async ({
      page,
    }) => {
      // create a collection from the transforms list
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Transform folder", { exact: true }).click();

      await nameField(modal(page)).fill("Marketing Transforms");
      await button(modal(page), "Create").click();

      await expect(
        getTransformsList(page).getByText("Marketing Transforms", {
          exact: true,
        }),
      ).toBeVisible();

      // create a nested collection
      await button(page, "Create a transform").click();
      await popover(page).getByText("Transform folder", { exact: true }).click();

      await nameField(modal(page)).fill("Q4 Reports");
      await collectionPickerButton(modal(page)).click();

      await collectionPickerDialog(page)
        .getByText("Marketing Transforms", { exact: true })
        .click();
      await button(collectionPickerDialog(page), "Select").click();

      await button(modal(page), "Create").click();

      // Upstream's own comment explains this: the list refetches its collection
      // tree after the create, and the parent row only renders an "Expand"
      // control once the new child is in the refetched tree. Clicking the row
      // name is a no-op until then. Ported verbatim, including the reasoning.
      await getTransformsList(page)
        .getByRole("button", { name: "Expand", exact: true })
        .click();
      await expect(
        getTransformsList(page).getByText("Q4 Reports", { exact: true }),
      ).toBeVisible();

      // create a transform and save it to a collection
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      const dialog = modal(page);
      await clearAndType(nameField(dialog), "Sales Summary");
      await clearAndType(tableNameField(dialog), "sales_summary");
      await collectionPickerButton(dialog).click();

      await collectionPickerDialog(page)
        .getByText("Marketing Transforms", { exact: true })
        .click();
      await button(collectionPickerDialog(page), "Select").click();

      const created = waitForCreateTransform(page);
      await button(modal(page), "Save").click();
      await created;

      // verify breadcrumbs show the collection path
      const breadcrumbs = DataStudio.breadcrumbs(page);
      await expect(
        breadcrumbs.getByText("Marketing Transforms", { exact: true }),
      ).toBeVisible();
      await expect(
        breadcrumbs.getByText("Sales Summary", { exact: true }),
      ).toBeVisible();

      // navigate back to list via breadcrumb
      await breadcrumbs
        .getByRole("link", { name: "Marketing Transforms", exact: true })
        .click();

      await expect(page).toHaveURL(/collectionId=/);
      await expect(
        getTransformsList(page).getByText("Sales Summary", { exact: true }),
      ).toBeVisible();
      await expect(
        getTransformsList(page).getByText("Q4 Reports", { exact: true }),
      ).toBeVisible();
    });

    /**
     * BLOCKED at the "move back to root" step, and I could NOT determine
     * whether the cause is the app or this environment. Recording the
     * measurements rather than a mechanism (see findings-inbox/transforms.md).
     *
     * Upstream's second move does `H.modal().within(() =>
     * cy.findByText("Transforms").click())` — i.e. it clicks the transforms
     * ROOT row in the move picker. Measured on this build, the dialog's
     * COMPLETE innerText in both states (transform at root, and transform
     * inside "Target Collection") is:
     *
     *   Move "Movable Transform" / Target Collection / New folder / Cancel / Select
     *
     * There is no "Transforms" row, anywhere in the dialog, at any wait.
     *
     * What was measured, not inferred:
     * - `item-picker-level-0` (the RootItemList column) has EMPTY innerHTML.
     *   `ItemList` returns `null` iff `filteredItems` is empty, so the root
     *   item list genuinely computes to zero items — it is not virtualization,
     *   not CSS, and not a timing window (2s settle, and level-1 is populated).
     * - `GET /api/collection/root?namespace=transforms` → **200**,
     *   `{"name":"Transforms","can_write":true,"id":"root"}`. The data the row
     *   would be built from is present and writable.
     * - No request fails while the dialog opens (only the harness's own
     *   snowplow CORS noise appears on the console).
     * - `useRootItems` pushes the transforms root under
     *   `namespaces.includes("transforms") && transformsEnabled`.
     *
     * ============ RESOLVED IN SESSION 4 — the mechanism is the TOKEN ==========
     * Session 3 wrote "`transforms-basic` IS in this instance's token features".
     * That is **FALSE**, and it was the one wrong step. Measured directly on
     * this backend immediately after a beforeEach activated `pro-self-hosted`
     * (`GET /api/session/properties` → `token-features`):
     *
     *   transforms-python: true
     *   transforms-basic:  FALSE      <-- and absent from the truthy list
     *
     * `use-get-root-items.ts:52` is
     * `const transformsEnabled = useHasTokenFeature("transforms-basic")`, so
     * `transformsEnabled` is false, the transforms root is never pushed, and
     * `filteredItems` is empty — exactly the empty `item-picker-level-0`
     * session 3 measured. Not a product bug, not port drift.
     *
     * WHY the token lacks it: `:transforms-basic` is `^{:added "0.59.0"}`
     * (premium_features/settings.clj:296) while `:transforms-python` is
     * `"0.57.0"`. The local `MB_PRO_SELF_HOSTED_TOKEN` predates the newer
     * feature. The rest of this spec is unaffected because
     * `token_check.clj/query-transforms-enabled?` only requires
     * `:transforms-basic` on HOSTED instances (`is-hosted?` is false here).
     *
     * Still `test.fixme`: the test genuinely cannot pass against this token.
     * It becomes a one-line un-fixme once the local token is refreshed — no
     * Cypress cross-check needed any more.
     */
    test("should move transforms between collections", async ({ page, mb }) => {
      test.fixme();
      await createTransformCollection(mb.api, { name: "Target Collection" });

      const transform = await createMbqlTransform(mb.api, {
        name: "Movable Transform",
        targetTable: "movable_transform",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // move transform to collection
      await getTransformHeaderEllipsis(page).click();
      await popover(page).getByText("Move", { exact: true }).click();

      await modal(page).getByText("Target Collection", { exact: true }).click();
      await button(modal(page), "Select").click();

      await expectUndoToast(page, "Transform moved");

      // verify breadcrumbs show collection path
      await expect(
        DataStudio.breadcrumbs(page).getByText("Target Collection", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        DataStudio.breadcrumbs(page).getByText("Movable Transform", {
          exact: true,
        }),
      ).toBeVisible();

      // move transform back to root
      await getTransformHeaderEllipsis(page).click();
      await popover(page).getByText("Move", { exact: true }).click();

      await modal(page).getByText("Transforms", { exact: true }).click();
      await button(modal(page), "Select").click();

      // Upstream switches to H.undoToastList() here for the SECOND toast,
      // because the first is still mounted. expectUndoToast already handles the
      // transient duplicate by filtering on text and taking the first match.
      await expectUndoToast(page, "Transform moved");

      // verify breadcrumbs no longer show collection
      await expect(
        DataStudio.breadcrumbs(page).getByText("Target Collection", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        DataStudio.breadcrumbs(page).getByText("Movable Transform", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should support search in the transforms list", async ({
      page,
      mb,
    }) => {
      const collection = await createTransformCollection(mb.api, {
        name: "Analytics",
      });
      await createMbqlTransform(mb.api, {
        name: "Alpha Transform",
        targetTable: "alpha_output",
      });
      await createMbqlTransform(mb.api, {
        name: "Beta Transform",
        targetTable: "beta_output",
        collectionId: collection.id,
      });

      await visitTransformListPage(page);

      // search should find transforms by name
      await transformsSearchInput(page).fill("alpha");

      await expect(getTransformsList(page).getByRole("row")).toHaveCount(1);
      await expect(
        getTransformsList(page).getByText("Alpha Transform", { exact: true }),
      ).toBeVisible();
      await expect(
        getTransformsList(page).getByText("Beta Transform", { exact: true }),
      ).toHaveCount(0);

      // search should find transforms by output table name
      await transformsSearchInput(page).fill("beta_output");

      await expect(
        getTransformsList(page).getByText("Beta Transform", { exact: true }),
      ).toBeVisible();
      await expect(
        getTransformsList(page).getByText("Alpha Transform", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getTransformsList(page).getByText("Analytics", { exact: true }),
      ).toBeVisible();

      await transformsSearchInput(page).fill("");
    });

    test("should create a new collection from the collection picker while saving a transform", async ({
      page,
    }) => {
      await visitTransformListPage(page);
      await button(page, "Create a transform").click();
      await popover(page).getByText("Query builder", { exact: true }).click();

      await pickWritableAnimals(page);
      await button(getQueryEditor(page), "Save").click();

      // open collection picker and create new collection inline
      const dialog = modal(page);
      await clearAndType(nameField(dialog), "Analytics Transform");
      await clearAndType(tableNameField(dialog), "analytics_transform");
      await collectionPickerButton(dialog).click();

      await collectionPickerDialog(page)
        .getByRole("button", { name: /New folder/ })
        .click();

      const newCollectionDialog = page.getByRole("dialog", {
        name: "Create a new collection",
      });
      await newCollectionDialog
        .getByLabel("Give it a name", { exact: true })
        .fill("Analytics");
      await button(newCollectionDialog, "Create").click();

      await expect(
        collectionPickerDialog(page).getByText("Analytics", { exact: true }),
      ).toBeVisible();
      await button(collectionPickerDialog(page), "Select").click();

      const created = waitForCreateTransform(page);
      await button(modal(page), "Save").click();
      await created;

      // verify transform is in the new collection
      await expect(
        DataStudio.breadcrumbs(page).getByText("Analytics", { exact: true }),
      ).toBeVisible();
      await expect(
        DataStudio.breadcrumbs(page).getByText("Analytics Transform", {
          exact: true,
        }),
      ).toBeVisible();

      await getTransformsNavLink(page).click();
      await expect(
        getTransformsList(page).getByText("Analytics", { exact: true }),
      ).toBeVisible();
      await getTransformsList(page).getByText("Analytics", { exact: true }).click();
      await expect(
        getTransformsList(page).getByText("Analytics Transform", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should sort transforms by all columns", async ({ page, mb }) => {
      const collection = await createTransformCollection(mb.api, {
        name: "Reports",
      });
      await createMbqlTransform(mb.api, {
        name: "Zebra Transform",
        targetTable: "zebra_output",
      });
      await createMbqlTransform(mb.api, {
        name: "Alpha Transform",
        targetTable: "alpha_output",
        collectionId: collection.id,
      });
      await createMbqlTransform(mb.api, {
        name: "Middle Transform",
        targetTable: "middle_output",
      });

      await visitTransformListPage(page);

      // expand Reports collection to see all transforms
      await getTransformsList(page).getByText("Reports", { exact: true }).click();

      // verify sorting by name column ascending
      await getTransformsList(page).getByText("Name", { exact: true }).click();
      await expect.poll(() => getRowNames(page)).toEqual([
        "Middle Transform",
        "Python library",
        "Reports",
        "Alpha Transform",
        "Zebra Transform",
      ]);

      // verify sorting by name column descending
      await getTransformsList(page).getByText("Name", { exact: true }).click();
      await expect.poll(() => getRowNames(page)).toEqual([
        "Zebra Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
      ]);

      // verify sorting by output table column ascending
      await getTransformsList(page)
        .getByText("Output table", { exact: true })
        .click();
      await expect.poll(() => getRowNames(page)).toEqual([
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
        "Zebra Transform",
      ]);

      // verify sorting by output table column descending
      await getTransformsList(page)
        .getByText("Output table", { exact: true })
        .click();
      await expect.poll(() => getRowNames(page)).toEqual([
        "Zebra Transform",
        "Middle Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
      ]);
    });

    test("should edit collection details", async ({ page, mb }) => {
      await createTransformCollection(mb.api, { name: "Original Name" });
      await createTransformCollection(mb.api, { name: "Target Parent" });

      await visitTransformListPage(page);

      // open edit modal via collection menu
      await collectionRowOptions(page, "Original Name").click();
      await popover(page)
        .getByText("Edit collection details", { exact: true })
        .click();

      // edit name and description
      const dialog = modal(page);
      await expect(
        dialog.getByText("Editing Original Name", { exact: true }),
      ).toBeVisible();
      await clearAndType(nameField(dialog), "Renamed Collection");
      await appendType(
        dialog.getByLabel("Description", { exact: true }),
        "A helpful description",
      );
      await collectionPickerButton(dialog).click();

      // change parent collection
      await collectionPickerDialog(page)
        .getByText("Target Parent", { exact: true })
        .click();
      await button(collectionPickerDialog(page), "Select").click();

      await button(modal(page), "Save").click();

      // verify collection was renamed and moved
      await expect(
        getTransformsList(page).getByText("Original Name", { exact: true }),
      ).toHaveCount(0);
      await getTransformsList(page)
        .getByText("Target Parent", { exact: true })
        .click();
      await expect(
        getTransformsList(page).getByText("Renamed Collection", { exact: true }),
      ).toBeVisible();
    });

    test("should archive a collection with transforms", async ({
      page,
      mb,
    }) => {
      const collection = await createTransformCollection(mb.api, {
        name: "Archive Me",
      });
      await createMbqlTransform(mb.api, {
        name: "Transform In Collection",
        targetTable: "archived_transform_table",
        collectionId: collection.id,
      });

      await visitTransformListPage(page);

      await expect(
        getTransformsList(page).getByText("Archive Me", { exact: true }),
      ).toBeVisible();
      await getTransformsList(page)
        .getByText("Archive Me", { exact: true })
        .click();
      await expect(
        getTransformsList(page).getByText("Transform In Collection", {
          exact: true,
        }),
      ).toBeVisible();

      // archive the collection via menu
      await collectionRowOptions(page, "Archive Me").click();
      await popover(page).getByText("Archive", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText('Archive "Archive Me"?', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("This will also archive 1 transform inside it.", {
          exact: true,
        }),
      ).toBeVisible();
      await button(dialog, "Archive").click();

      await expectUndoToast(page, '"Archive Me" has been archived');

      // verify collection and its children are no longer visible
      await expect(
        getTransformsList(page).getByText("Archive Me", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getTransformsList(page).getByText("Transform In Collection", {
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("should show Python library item and navigate to it", async ({
      page,
      mb,
    }) => {
      // Python library row only appears when we have at least one transform
      await createSqlTransform(mb.api, {
        sourceQuery: "SELECT 1",
        targetTable: "table_a",
        targetSchema: TARGET_SCHEMA,
      });
      await visitTransformListPage(page);

      // Python library should be visible in the list
      await expect(
        getTransformsList(page).getByText("Python library", { exact: true }),
      ).toBeVisible();

      // clicking Python library should navigate to the library editor
      await getTransformsList(page)
        .getByText("Python library", { exact: true })
        .click();

      await expect(page).toHaveURL(
        /\/data-studio\/transforms\/library\/common\.py/,
      );
      await expect(getLibraryEditorHeader(page)).toBeVisible();
    });
  });

  test.describe("revision history", () => {
    test("should be able to view and revert transform revisions", async ({
      page,
      mb,
    }) => {
      // Create a transform with initial name
      const transform = await createMbqlTransform(mb.api, {
        name: "Revision Test Transform",
      });
      await DataStudio.Transforms.visitTransform(page, transform.id);

      // Make changes to create a revision
      let updated = waitForUpdateTransform(page);
      await clearAndType(getTransformNameInput(page), "Updated Transform Name");
      await getTransformNameInput(page).blur();
      await updated;

      // Make another change
      updated = waitForUpdateTransform(page);
      await clearAndType(getTransformNameInput(page), "Another Updated Name");
      await getTransformNameInput(page).blur();
      await updated;

      // Open revision history
      const revisionHistory = waitForApi(page, "GET", /^\/api\/revision$/);
      await getTransformHeaderEllipsis(page).click();
      await popover(page).getByText("History", { exact: true }).click();
      await revisionHistory;

      // Verify revision history sidebar is open
      await expect(getTransformHistoryList(page)).toBeVisible();

      // Verify revision entries are displayed
      await expect(
        getTransformHistoryList(page).getByText(/created this/),
      ).toBeVisible();

      // Revert to an earlier revision
      const reverted = waitForApi(page, "POST", /^\/api\/revision\/revert$/);
      const transformReload = waitForApi(
        page,
        "GET",
        /^\/api\/transform\/[^/]+$/,
      );
      await getTransformHistoryList(page)
        .getByTestId("revision-history-event")
        .filter({ hasText: /created this/ })
        .getByTestId("question-revert-button")
        .click();
      await Promise.all([reverted, transformReload]);

      // Verify transform was reverted
      await expect(getTransformNameInput(page)).toHaveValue(
        "Revision Test Transform",
      );

      // Verify revert entry appears in history
      await expect(
        getTransformHistoryList(page).getByText(/reverted to an earlier version/),
      ).toBeVisible();

      // Surface backend error when a revert fails (UXW-310).
      // Port of cy.intercept(..., { statusCode: 500, body }) → page.route with
      // a fulfilled response. Registered BEFORE the click that triggers it.
      await page.route("**/api/revision/revert", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Cannot revert: missing transform" }),
        }),
      );

      const failedRevert = waitForApi(page, "POST", /^\/api\/revision\/revert$/);
      await getTransformHistoryList(page)
        .getByTestId("question-revert-button")
        .first()
        .click();
      await failedRevert;

      await expectUndoToast(page, "Cannot revert: missing transform");
    });
  });

  test.describe("read-only remote sync", () => {
    let repo: RemoteSyncRepo | undefined;
    let transformId: number;

    test.beforeEach(async ({ mb }) => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      // create a transform
      const transform = await createSqlTransform(mb.api, {
        sourceQuery: "SELECT * FROM {{ table }}",
        tableVariableTable: SOURCE_TABLE,
        tableVariableSchema: TARGET_SCHEMA,
      });
      transformId = transform.id;

      // set up remote sync
      repo = setupGitSync();
      await configureGit(mb.api, repo, "read-only");
    });

    test.afterEach(() => {
      teardownGitSync(repo);
      repo = undefined;
    });

    test("should make the transform list page read-only", async ({ page }) => {
      // visit transforms page
      await visitTransformListPage(page);

      // 'Create a transform' button is disabled with tooltip
      const createButton = button(page, "Create a transform");
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeDisabled();
      // realHover → hover({ force: true }): the button is disabled, so
      // Playwright's actionability check would never resolve it, while
      // cy.realHover is coordinate-based and skips that check. Same deviation
      // the earlier getSchemaLink hover needed.
      await createButton.hover({ force: true });
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toHaveText(
        "Transforms can't be created when Remote Sync is in read-only mode",
      );

      // clicking Python library navigates to the library editor
      await getTransformsList(page)
        .getByText("Python library", { exact: true })
        .click();

      // python library editor is read-only
      await expect(page).toHaveURL(
        /\/data-studio\/transforms\/library\/common\.py/,
      );
      await expect(
        page.getByRole("alert").filter({ hasText: /The Python library is not editable/ }),
      ).toBeVisible();

      const editorTextbox = DataStudio.PythonLibrary.editor(page).getByRole(
        "textbox",
      );
      await expect(editorTextbox).toHaveAttribute("contenteditable", "false");
      await expect(editorTextbox).toHaveAttribute("aria-readonly", "true");
    });

    test("should not allow editing a transform", async ({ page }) => {
      // visit transform. Upstream hardcodes /transforms/1 (safe only because
      // the snapshot restore resets the app DB); the port uses the created id.
      await DataStudio.Transforms.visitTransform(page, transformId);

      // 'edit definition' button is not displayed. Anchored on the Run tab
      // first: an unanchored absence check here is satisfied by "the page has
      // not painted yet" (measured on this very assertion in session 2).
      await expect(DataStudio.Transforms.runTab(page)).toBeVisible();
      await expect(
        DataStudio.Transforms.editDefinitionButton(page),
      ).toHaveCount(0);

      // visit the Run tab
      await DataStudio.Transforms.runTab(page).click();

      // schedule tags are not editable
      const tags = page.getByLabel("Tags", { exact: true });
      await expect(tags).toBeVisible();
      await expect(tags).toBeDisabled();

      // visit the Settings tab
      await DataStudio.Transforms.settingsTab(page).click();

      // 'Change target' button is not displayed
      await expect(
        page.getByRole("button", { name: /Change target/ }),
      ).toHaveCount(0);

      // 'Only process new data' switch is not displayed
      await expect(
        page.getByRole("switch", { name: /Only process new data/ }),
      ).toBeDisabled();

      // visiting edit mode url directly redirects to view-only mode
      await page.goto(`/data-studio/transforms/${transformId}/edit`);
      await expect(page).not.toHaveURL(/\/edit/);

      await DataStudio.Transforms.header(page)
        .getByRole("img", { name: "ellipsis icon" })
        .click();

      // ellipsis menu does not have move or delete options
      const menu = page.getByRole("menu");
      await expect(
        menu.getByRole("menuitem", { name: /History/ }),
      ).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /Move/ })).toHaveCount(0);
      await expect(menu.getByRole("menuitem", { name: /Delete/ })).toHaveCount(
        0,
      );
    });

    test("should show not found message on new transform pages", async ({
      page,
    }) => {
      for (const kind of ["native", "python", "query"]) {
        await page.goto(`/data-studio/transforms/new/${kind}`);

        const editor = getQueryEditor(page);
        await expect(editor).toBeVisible();
        await expect(
          editor.getByText("We're a little lost...", { exact: true }),
        ).toBeVisible();
      }
    });
  });
});

test.describe("scenarios > admin > transforms > databases without :schemas", () => {
  // Shadows the module-level DB_NAME ("Writable Postgres12") exactly as
  // upstream's describe-local const does.
  const MYSQL_DB_NAME = "QA MySQL8";

  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("mysql-8");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    void page;
  });

  test("should be not be possible to create a new schema when updating a transform target", async ({
    page,
    mb,
  }) => {
    const transform = await createMbqlTransform(mb.api, {
      databaseId: WRITABLE_DB_ID,
      sourceTable: "ORDERS",
      targetSchema: null,
    });
    await DataStudio.Transforms.visitTransform(page, transform.id);

    await DataStudio.Transforms.settingsTab(page).click();
    await button(getTransformsTargetContent(page), "Change target").click();

    // Anchored on the modal being open: an unanchored absence check here is
    // satisfied by "the modal has not painted yet" (measured on this spec's
    // editDefinitionButton assertions in session 2).
    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    await expect(newTableNameField(dialog)).toBeVisible();
    await expect(dialog.getByLabel("Schema")).toHaveCount(0);
  });

  test("should be not be possible to create a new schema when the database does not support schemas", async ({
    page,
  }) => {
    // create a new transform
    await visitTransformListPage(page);
    await button(getTransformsList(page), "Create a transform").click();
    await popover(page).getByText("Query builder", { exact: true }).click();

    const picker = miniPicker(page);
    // MySQL has no schemas, so the picker goes database → table directly; the
    // table list is what the database click fetches.
    const tables = page.waitForResponse((response) =>
      /^\/api\/database\/\d+\/(schema|schemas)/.test(
        new URL(response.url()).pathname,
      ),
    );
    await picker.getByText(MYSQL_DB_NAME, { exact: true }).click();
    await tables;
    await picker.getByText("Orders", { exact: true }).click();

    await button(getQueryEditor(page), "Save").click();
    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    await expect(tableNameField(dialog)).toBeVisible();
    await expect(dialog.getByLabel("Schema")).toHaveCount(0);
  });
});

test.describe("scenarios > admin > transforms > jobs", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // Not in the Cypress original — see resetTransformTargetTables' docstring.
    // This describe RUNS transforms (the schedule and manual-run tests), so it
    // materialises real tables in the shared writable postgres.
    await resetTransformTargetTables();
    capture = await installSnowplowCapture(page, mb.baseUrl);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test.describe("creation", () => {
    test("should be able to create a job with default properties", async ({
      page,
    }) => {
      await visitJobListPage(page);
      await DataStudio.Jobs.list(page)
        .getByRole("link", { name: /New/ })
        .click();

      const created = waitForCreateJob(page);
      await button(DataStudio.Jobs.editor(page), "Save").click();
      await created;

      // verify transform_job_created event was tracked
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_job_created",
        triggered_from: "transform_job_new",
        result: "success",
      });

      await expectUndoToast(page, "New job created");

      const editor = DataStudio.Jobs.editor(page);
      await expect(editor.getByPlaceholder("Name")).toHaveValue("New job");
      await expect(getScheduleFrequencyInput(page)).toHaveValue("daily");
      await expect(getScheduleTimeInput(page)).toHaveValue("12:00");
    });

    test("should be able to create a job with custom property values", async ({
      page,
    }) => {
      await visitJobListPage(page);
      await DataStudio.Jobs.list(page)
        .getByRole("link", { name: /New/ })
        .click();

      const editor = DataStudio.Jobs.editor(page);
      await clearAndType(editor.getByPlaceholder("Name"), "Job");
      await getScheduleFrequencyInput(page).click();
      await popover(page).getByText("custom", { exact: true }).click();

      await clearAndType(getCronInput(page), "0 * * * ?");
      await getTagsInput(page).click();
      await popover(page).getByText("daily", { exact: true }).click();

      const created = waitForCreateJob(page);
      await button(editor, "Save").click();
      await created;

      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_job_created",
        triggered_from: "transform_job_new",
        result: "success",
      });

      await expectUndoToast(page, "New job created");

      await expect(editor.getByPlaceholder("Name")).toHaveValue("Job");
      await expect(getCronInput(page)).toHaveValue("0 * * * ?");
      await expect(
        editor.getByText(/This job will run every hour/),
      ).toBeVisible();
      await expect(editor.getByText("daily", { exact: true })).toBeVisible();
    });
  });

  test.describe("name", () => {
    test("should be able to edit the name after creation", async ({
      page,
      mb,
    }) => {
      const job = await createTransformJob(mb.api, { name: "New job" });
      await visitTransformJob(page, job.id);

      const nameInput = DataStudio.Jobs.editor(page).getByPlaceholder("Name");
      await clearAndType(nameInput, "New name");
      await nameInput.blur();
      await expectUndoToast(page, "Job name updated");
      await expect(nameInput).toHaveValue("New name");
    });
  });

  test.describe("schedule", () => {
    test.afterEach(async () => {
      if (!capture) {
        return;
      }
      expectNoBadSnowplowEvents(capture);
    });

    test("should be able to run a job on a schedule", async ({ page, mb }) => {
      const tag = await createTransformTag(mb.api, { name: "New tag" });
      const transform = await createMbqlTransform(mb.api, {
        tagIds: [tag.id],
      });
      await createTransformJob(mb.api, {
        name: "New job",
        schedule: "* * * * * ? *", // every second
        tag_ids: [tag.id],
      });

      await waitForSucceededTransformRuns(mb.api);
      await visitRunListPage(page);
      const runTable = getTransformRunTable(page);
      await expect(
        runTable.getByText("MBQL transform", { exact: true }),
      ).not.toHaveCount(0);
      await expect(
        runTable.getByText("Success", { exact: true }),
      ).not.toHaveCount(0);
      await expect(
        runTable.getByText("Schedule", { exact: true }),
      ).not.toHaveCount(0);

      // open detail sidebar
      await page.getByText("MBQL transform", { exact: true }).first().click();
      await expect(
        DataStudio.Runs.sidebar(page).getByRole("img", { name: "close icon" }),
      ).toBeVisible();

      // Upstream hardcodes href "/data-studio/transforms/1" — safe only
      // because the snapshot restore resets the app DB. Ported as the created
      // transform's real id, same as sessions 2/3 did for the other hardcoded
      // ids in this file.
      const viewTransform = page.getByRole("link", {
        name: "View this transform",
        exact: true,
      });
      await expect(viewTransform).toBeVisible();
      await expect(viewTransform).toHaveAttribute(
        "href",
        `/data-studio/transforms/${transform.id}`,
      );

      const viewGraph = page.getByRole("link", {
        name: "View in dependency graph",
        exact: true,
      });
      await expect(viewGraph).toBeVisible();
      await expect(viewGraph).toHaveAttribute(
        "href",
        `/data-studio/dependencies?id=${transform.id}&type=transform`,
      );
      await viewGraph.click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "dependency_entity_selected",
        triggered_from: "transform-run-list",
        event_detail: "transform-run",
      });
    });

    test("should be able to change the schedule after creation", async ({
      page,
      mb,
    }) => {
      const job = await createTransformJob(mb.api, { name: "New job" });
      await visitTransformJob(page, job.id);

      await getScheduleFrequencyInput(page).click();
      await popover(page).getByText("weekly", { exact: true }).click();
      await expectUndoToast(page, "Job schedule updated");
      await expect(getScheduleFrequencyInput(page)).toHaveValue("weekly");
    });

    test("should recognize built-in jobs in the cron builder", async ({
      page,
    }) => {
      await visitJobListPage(page);

      const jobNameToFrequency = {
        "Hourly job": "hourly",
        "Daily job": "daily",
        "Weekly job": "weekly",
        "Monthly job": "monthly",
      };
      for (const [jobName, frequency] of Object.entries(jobNameToFrequency)) {
        await DataStudio.Jobs.list(page)
          .getByText(jobName, { exact: true })
          .click();
        await expect(getScheduleFrequencyInput(page)).toHaveValue(frequency);
        await page.goBack();
        // cy.go("back") is queued behind the next command's retries; Playwright
        // returns as soon as the navigation commits, so re-anchor on the list.
        await expect(DataStudio.Jobs.list(page)).toBeVisible();
      }
    });
  });

  test.describe("tags", () => {
    test("should be able to add and remove tags", async ({ page, mb }) => {
      const job = await createTransformJob(mb.api, { name: "New job" });
      await visitTransformJob(page, job.id);
      await getTagsInput(page).click();

      let updated = waitForUpdateJob(page);
      await popover(page).getByText("hourly", { exact: true }).click();
      await updated;
      await assertOptionSelected(page, "hourly");
      await assertOptionNotSelected(page, "daily");

      updated = waitForUpdateJob(page);
      await popover(page).getByText("daily", { exact: true }).click();
      await updated;
      await assertOptionSelected(page, "hourly");
      await assertOptionSelected(page, "daily");

      // cy.type("{backspace}") clicks its subject first, then sends the key.
      updated = waitForUpdateJob(page);
      await getTagsInput(page).click();
      await getTagsInput(page).press("Backspace");
      await updated;
      await assertOptionSelected(page, "hourly");
      await assertOptionNotSelected(page, "daily");
    });
  });

  test.describe("runs", () => {
    test("should be able to manually run a job", async ({ page, mb }) => {
      const tag = await createTransformTag(mb.api, { name: "New tag" });
      await createMbqlTransform(mb.api, { tagIds: [tag.id] });
      const job = await createTransformJob(mb.api, {
        name: "New job",
        tag_ids: [tag.id],
      });
      await visitTransformJob(page, job.id);

      await runJobAndWaitForSuccess(page);
      await expectUnstructuredSnowplowEvent(capture, {
        event: "transform_job_trigger_manual_run",
      });

      await expect(
        DataStudio.Jobs.editor(page).getByText(
          "Last ran a few seconds ago successfully.",
          { exact: true },
        ),
      ).toBeVisible();

      await getRunsNavLink(page).click();
      const runTable = getTransformRunTable(page);
      await expect(
        runTable.getByText("MBQL transform", { exact: true }),
      ).toBeVisible();
      await expect(runTable.getByText("Success", { exact: true })).toBeVisible();
      await expect(runTable.getByText("Manual", { exact: true })).toBeVisible();
    });

    test("should display the error message from a failed run", async ({
      page,
      mb,
    }) => {
      const tag = await createTransformTag(mb.api, { name: "New tag" });
      await createSqlTransform(mb.api, {
        sourceQuery: "SELECT * FROM abc",
        tagIds: [tag.id],
      });
      const job = await createTransformJob(mb.api, {
        name: "New job",
        tag_ids: [tag.id],
      });
      await visitTransformJob(page, job.id);

      await runJobAndWaitForFailure(page);
      await expect(
        DataStudio.Jobs.editor(page).getByText("Last run failed a few seconds ago."),
      ).toBeVisible();

      await getRunErrorInfoButton(page).click();
      await expect(modal(page)).toContainText('relation "abc" does not exist');
    });
  });

  test.describe("deletion", () => {
    test("should be able to delete a job", async ({ page, mb }) => {
      // create a job with a tag
      const tag = await createTransformTag(mb.api, { name: "New tag" });
      const job = await createTransformJob(mb.api, {
        name: "New job",
        tag_ids: [tag.id],
      });
      await visitTransformJob(page, job.id);

      // delete the job
      await icon(DataStudio.Jobs.header(page), "ellipsis").click();
      await popover(page).getByText("Delete", { exact: true }).click();
      const deleted = waitForDeleteJob(page);
      await button(modal(page), "Delete job").click();
      await deleted;

      await expect(DataStudio.Jobs.list(page)).toBeVisible();
      await expect(
        DataStudio.Jobs.list(page).getByText("New job", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("active flag", () => {
    test("can disable and re-enable jobs from the list, the detail page, and in bulk", async ({
      page,
      mb,
    }) => {
      await createTransformJob(mb.api, { name: "Job A" });
      await createTransformJob(mb.api, { name: "Job B" });

      await visitJobListPage(page);

      // disable Job A from the row menu — no navigation
      let updated = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/(?!active$)[^/]+$/,
      );
      await icon(getJobRow(page, "Job A"), "ellipsis").click();
      await popover(page).getByText("Disable", { exact: true }).click();
      expect(await updated).toEqual({ active: false });
      await expectUndoToast(page, "Job disabled");
      await icon(undoToast(page).first(), "close").click();
      await expect(
        getJobRow(page, "Job A").getByText("Disabled", { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/data-studio\/transforms\/jobs$/);

      // re-enable Job A from the row menu
      updated = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/(?!active$)[^/]+$/,
      );
      await icon(getJobRow(page, "Job A"), "ellipsis").click();
      await popover(page).getByText("Re-enable", { exact: true }).click();
      expect(await updated).toEqual({ active: true });
      await expectUndoToast(page, "Job enabled");
      await icon(undoToast(page).first(), "close").click();
      await expect(
        getJobRow(page, "Job A").getByText("Disabled", { exact: true }),
      ).toHaveCount(0);

      // disable Job A from the detail page
      await getJobRow(page, "Job A").click();
      updated = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/(?!active$)[^/]+$/,
      );
      await icon(DataStudio.Jobs.header(page), "ellipsis").click();
      await popover(page).getByText("Disable", { exact: true }).click();
      expect(await updated).toEqual({ active: false });
      await expectUndoToast(page, "Job disabled");
      await icon(undoToast(page).first(), "close").click();
      await expect(
        DataStudio.Jobs.editor(page).getByText("Disabled", { exact: true }),
      ).toBeVisible();

      // re-enable Job A from the detail page
      updated = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/(?!active$)[^/]+$/,
      );
      await icon(DataStudio.Jobs.header(page), "ellipsis").click();
      await popover(page).getByText("Re-enable", { exact: true }).click();
      expect(await updated).toEqual({ active: true });
      await expect(
        DataStudio.Jobs.editor(page).getByText("Disabled", { exact: true }),
      ).toHaveCount(0);

      await DataStudio.nav(page)
        .getByRole("link", { name: "Jobs", exact: true })
        .click();

      // bulk-disable: cancel from the modal does not fire the mutation
      await openBulkActionsMenu(page);
      await popover(page).getByText("Disable all", { exact: true }).click();
      await button(modal(page), "Cancel").click();

      // bulk-disable: confirming sends { active: false } and badges all rows
      let bulk = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/active$/,
      );
      await openBulkActionsMenu(page);
      await popover(page).getByText("Disable all", { exact: true }).click();
      await button(modal(page), "Disable all").click();
      expect(await bulk).toEqual({ active: false });
      await expect(
        getJobRow(page, "Job A").getByText("Disabled", { exact: true }),
      ).toBeVisible();
      await expect(
        getJobRow(page, "Job B").getByText("Disabled", { exact: true }),
      ).toBeVisible();

      // mixed state: bulk menu shows both items, then bulk-re-enable
      updated = waitForApiRequestBody(
        page,
        "PUT",
        /^\/api\/transform-job\/(?!active$)[^/]+$/,
      );
      await icon(getJobRow(page, "Job A"), "ellipsis").click();
      await popover(page).getByText("Re-enable", { exact: true }).click();
      await updated;

      bulk = waitForApiRequestBody(page, "PUT", /^\/api\/transform-job\/active$/);
      await openBulkActionsMenu(page);
      await expect(
        popover(page).getByText("Disable all", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Re-enable all", { exact: true }),
      ).toBeVisible();
      await popover(page).getByText("Re-enable all", { exact: true }).click();
      expect(await bulk).toEqual({ active: true });
      await expect(
        getJobRow(page, "Job A").getByText("Disabled", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getJobRow(page, "Job B").getByText("Disabled", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("default jobs and tags", () => {
    test("should pre-create default jobs and tags", async ({ page }) => {
      const jobNames = ["Hourly job", "Daily job", "Weekly job", "Monthly job"];
      const tagNames = ["hourly", "daily", "weekly", "monthly"];

      // make sure that default jobs are created
      await visitJobListPage(page);
      for (const jobName of jobNames) {
        await expect(
          DataStudio.Jobs.list(page).getByText(jobName, { exact: true }),
        ).toBeVisible();
      }

      // make sure that default tags are available for selection
      await DataStudio.Jobs.list(page)
        .getByRole("link", { name: /New/ })
        .click();
      await getTagsInput(page).click();
      for (const tagName of tagNames) {
        await expect(
          popover(page).getByText(tagName, { exact: true }),
        ).toBeVisible();
      }
    });
  });

  test.describe("dependencies", () => {
    test("should render the transforms table", async ({ page, mb }) => {
      const tag = await createTransformTag(mb.api, { name: "tag1" });
      await createMbqlTransform(mb.api, {
        targetTable: TARGET_TABLE,
        tagIds: [tag.id],
      });
      const job = await createTransformJob(mb.api, { tag_ids: [tag.id] });
      await visitTransformJob(page, job.id);

      const transformsHeading = DataStudio.Jobs.editor(page).getByText(
        "Transforms",
        { exact: true },
      );
      await transformsHeading.scrollIntoViewIfNeeded();
      await expect(transformsHeading).toBeVisible();

      await expect(
        getJobTransformTable(page).getByText("MBQL transform", { exact: true }),
      ).toBeVisible();
    });

    test("should not render the transforms table if the job has no transforms", async ({
      page,
      mb,
    }) => {
      const job = await createTransformJob(mb.api);
      await visitTransformJob(page, job.id);

      const emptyState = DataStudio.Jobs.editor(page).getByText(
        /There are no transforms for this job/,
      );
      await emptyState.scrollIntoViewIfNeeded();
      await expect(emptyState).toBeVisible();
      // Anchored on the empty state above, so the table's absence is read off a
      // rendered page rather than an unpainted one.
      await expect(getJobTransformTable(page)).toHaveCount(0);
    });
  });
});

test.describe("scenarios > admin > transforms > runs", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    // Not in the Cypress original — see resetTransformTargetTables' docstring.
    // Both tests here RUN a transform, so they materialise real tables.
    await resetTransformTargetTables();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  test("should be able to filter runs", async ({ page, mb }) => {
    async function createInitialData() {
      const tag1 = await createTransformTag(mb.api, { name: "tag1" });
      const tag2 = await createTransformTag(mb.api, { name: "tag2" });

      const mbql = await createMbqlTransform(mb.api, {
        targetTable: TARGET_TABLE,
        tagIds: [tag1.id],
      });
      await DataStudio.Transforms.visitTransform(page, mbql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      const sql = await createSqlTransform(mb.api, {
        sourceQuery: "SELECT * FROM abc",
        targetTable: TARGET_TABLE_2,
        tagIds: [tag2.id],
      });
      await DataStudio.Transforms.visitTransform(page, sql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForFailure(page);
    }

    const runTable = () => getTransformRunTable(page);
    const rowText = (name: string) =>
      runTable().getByText(name, { exact: true });

    async function expectBothTransforms() {
      await expect(rowText("MBQL transform")).toBeVisible();
      await expect(rowText("SQL transform")).toBeVisible();
    }

    async function testTransformFilter() {
      // no filters
      await expectBothTransforms();

      // transform filter - add a filter
      await getTransformFilterWidget(page).click();
      await popover(page).getByText("MBQL transform", { exact: true }).click();
      await button(popover(page), "Add filter").click();
      await expect(
        getTransformFilterWidget(page).getByText("MBQL transform", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toBeVisible();
      await expect(rowText("SQL transform")).toHaveCount(0);

      // transform filter - update a filter
      await getTransformFilterWidget(page).click();
      await popover(page).getByText("MBQL transform", { exact: true }).click();
      await popover(page).getByText("SQL transform", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getTransformFilterWidget(page).getByText("SQL transform", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toHaveCount(0);
      await expect(rowText("SQL transform")).toBeVisible();

      // transform filter - multiple options
      await getTransformFilterWidget(page).click();
      await popover(page).getByText("MBQL transform", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getTransformFilterWidget(page).getByText("2 transforms", {
          exact: true,
        }),
      ).toBeVisible();
      await expectBothTransforms();

      // transform filter - remove filter
      await button(getTransformFilterWidget(page), "Remove filter").click();
      await expect(
        getTransformFilterWidget(page).getByText("2 transforms", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expectBothTransforms();
    }

    async function testStatusFilter() {
      // no filters
      await expectBothTransforms();

      // status filter - add a filter
      await getStatusFilterWidget(page).click();
      await popover(page).getByText("Success", { exact: true }).click();
      await button(popover(page), "Add filter").click();
      await expect(
        getStatusFilterWidget(page).getByText("Success", { exact: true }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toBeVisible();
      await expect(rowText("SQL transform")).toHaveCount(0);

      // status filter - update a filter
      await getStatusFilterWidget(page).click();
      await popover(page).getByText("Success", { exact: true }).click();
      await popover(page).getByText("Failed", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getStatusFilterWidget(page).getByText("Failed", { exact: true }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toHaveCount(0);
      await expect(rowText("SQL transform")).toBeVisible();

      // status filter - multiple options
      await getStatusFilterWidget(page).click();
      await popover(page).getByText("Success", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getStatusFilterWidget(page).getByText("2 statuses", { exact: true }),
      ).toBeVisible();
      await expectBothTransforms();

      // transform filter - remove filter
      await button(getStatusFilterWidget(page), "Remove filter").click();
      await expect(
        getStatusFilterWidget(page).getByText("2 statuses", { exact: true }),
      ).toHaveCount(0);
      await expectBothTransforms();
    }

    async function testTagFilter() {
      // no filters
      await expectBothTransforms();

      // tag filter - add a filter
      await getTagFilterWidget(page).click();
      await popover(page).getByText("tag1", { exact: true }).click();
      await button(popover(page), "Add filter").click();
      await expect(
        getTagFilterWidget(page).getByText("tag1", { exact: true }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toBeVisible();
      await expect(rowText("SQL transform")).toHaveCount(0);

      // tag filter - update a filter
      await getTagFilterWidget(page).click();
      await popover(page).getByText("tag1", { exact: true }).click();
      await popover(page).getByText("tag2", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getTagFilterWidget(page).getByText("tag2", { exact: true }),
      ).toBeVisible();
      await expect(rowText("MBQL transform")).toHaveCount(0);
      await expect(rowText("SQL transform")).toBeVisible();

      // tag filter - multiple options
      await getTagFilterWidget(page).click();
      await popover(page).getByText("tag1", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getTagFilterWidget(page).getByText("2 tags", { exact: true }),
      ).toBeVisible();
      await expectBothTransforms();

      // tag filter - remove filter
      await button(getTagFilterWidget(page), "Remove filter").click();
      await expect(
        getTagFilterWidget(page).getByText("2 tags", { exact: true }),
      ).toHaveCount(0);
      await expectBothTransforms();
    }

    async function testRunMethodFilter() {
      // no filters
      await expectBothTransforms();

      // run method filter - add a filter
      await getRunMethodFilterWidget(page).click();
      await popover(page).getByText("Manual", { exact: true }).click();
      await button(popover(page), "Add filter").click();
      await expect(
        getRunMethodFilterWidget(page).getByText("Manual", { exact: true }),
      ).toBeVisible();
      await expectBothTransforms();

      // run method filter - update a filter
      await getRunMethodFilterWidget(page).click();
      await popover(page).getByText("Manual", { exact: true }).click();
      await popover(page).getByText("Schedule", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getRunMethodFilterWidget(page).getByText("Schedule", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("No runs found", { exact: true }),
      ).toBeVisible();

      // run method filter - multiple options
      await getRunMethodFilterWidget(page).click();
      await popover(page).getByText("Manual", { exact: true }).click();
      await button(popover(page), "Update filter").click();
      await expect(
        getRunMethodFilterWidget(page).getByText("Schedule, Manual", {
          exact: true,
        }),
      ).toBeVisible();
      await expectBothTransforms();

      // run method filter - remove filter
      await button(getRunMethodFilterWidget(page), "Remove filter").click();
      await expect(
        getRunMethodFilterWidget(page).getByText("Schedule, Manual", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expectBothTransforms();
    }

    async function testDateFilter(widget: (page: Page) => Locator) {
      // no filters
      await expectBothTransforms();

      // today
      await widget(page).click();
      await popover(page).getByText("Today", { exact: true }).click();
      await expect(
        widget(page).getByText("Today", { exact: true }),
      ).toBeVisible();
      await expectBothTransforms();

      await button(widget(page), "Remove filter").click();
      await widget(page).click();
      await popover(page)
        .getByText("Relative date range…", { exact: true })
        .click();
      await popover(page).getByLabel("Include today", { exact: true }).click();
      await button(popover(page), "Apply").click();
      await expect(
        widget(page).getByText("Previous 30 days or today", { exact: true }),
      ).toBeVisible();
      await expectBothTransforms();

      await button(widget(page), "Remove filter").click();
      await widget(page).click();
      await popover(page).getByText("Previous week", { exact: true }).click();
      await expect(
        widget(page).getByText("Previous week", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("No runs found", { exact: true }),
      ).toBeVisible();

      await button(widget(page), "Remove filter").click();
      await expectBothTransforms();
    }

    await createInitialData();
    await getRunsNavLink(page).click();
    await testTransformFilter();
    await testStatusFilter();
    await testTagFilter();
    await testRunMethodFilter();
    // Upstream writes testStartAtFilter/testEndAtFilter as two byte-identical
    // bodies differing only in the widget getter. Parameterised, not merged —
    // both are still invoked, in the same order, with the same assertions.
    await testDateFilter(getStartAtFilterWidget);
    await testDateFilter(getEndAtFilterWidget);
  });

  test("should be able to sort runs", async ({ page, mb }) => {
    async function createInitialData() {
      const tag1 = await createTransformTag(mb.api, { name: "Alpha tag" });
      const tag2 = await createTransformTag(mb.api, { name: "Beta tag" });

      const mbql = await createMbqlTransform(mb.api, {
        targetTable: TARGET_TABLE,
        tagIds: [tag1.id],
      });
      await DataStudio.Transforms.visitTransform(page, mbql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForSuccess(page);

      const sql = await createSqlTransform(mb.api, {
        sourceQuery: "SELECT * FROM abc",
        targetTable: TARGET_TABLE_2,
        tagIds: [tag2.id],
      });
      await DataStudio.Transforms.visitTransform(page, sql.id);
      await DataStudio.Transforms.runTab(page).click();
      await runTransformInUiAndWaitForFailure(page);
    }

    async function testSorting({
      columnName,
      transformNames,
    }: {
      columnName: string;
      transformNames: string[];
    }) {
      // sort by <columnName> ascending
      await getTransformRunTable(page)
        .getByText(columnName, { exact: true })
        .click();
      await checkSortingOrder(page, transformNames);

      // sort by <columnName> descending
      await getTransformRunTable(page)
        .getByText(columnName, { exact: true })
        .click();
      await checkSortingOrder(page, [...transformNames].reverse());
    }

    await createInitialData();
    await getRunsNavLink(page).click();

    // ascending: "MBQL transform" < "SQL transform"
    await testSorting({
      columnName: "Transform",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: MBQL started earlier
    await testSorting({
      columnName: "Started at",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: MBQL ended earlier
    await testSorting({
      columnName: "Ended at",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: "Failed" < "Success"
    await testSorting({
      columnName: "Status",
      transformNames: ["SQL transform", "MBQL transform"],
    });

    // ascending: both "Manual", stable sort by id — MBQL created first
    await testSorting({
      columnName: "Trigger",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: "Alpha tag" < "Beta tag"
    await testSorting({
      columnName: "Tags",
      transformNames: ["MBQL transform", "SQL transform"],
    });
  });
});

/**
 * Upstream tags this whole describe `@python`. PROBED this session rather than
 * assumed (the brief asked for exactly this): both tests call
 * `runPythonScriptAndWaitForSuccess()`, i.e. both really execute a script, so
 * unlike the `python > common library` describe — where session 3 recovered 3
 * tests that only needed the token feature — neither of these splits off.
 *
 * What blocks them, measured on this jar, not inferred:
 * - `token-features` carries `transforms-python: true`, so there is NO 402.
 * - `POST /api/ee/transforms-python/test-run` (the endpoint the run button
 *   hits) returns **500**:
 *   `"An error occurred while copying table data to S3" /
 *    "Unable to execute HTTP request: Connect to localhost:4566 … Connection
 *    refused"`.
 * - `:5001` (python-runner) and `:4566` (localstack S3) both refuse
 *   connections; neither is in the local container set.
 *
 * So the blocker is exactly and only the missing containers, and the S3 side
 * fails first. Gated with unwritten bodies: PORTING forbids shipping a body
 * that cannot be verified.
 */
test.describe("scenarios > admin > transforms > python runner", () => {
  test("should be possible to test run a Python script", async () => {
    test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
  });

  test("should display preview notice message", async () => {
    test.skip(!process.env.PW_PYTHON_RUNNER_ENABLED, PYTHON_SKIP_REASON);
  });
});

/**
 * NOT gated on PW_QA_DB_ENABLED, deliberately: upstream's describe has no
 * `@external` tag and restores the DEFAULT snapshot — the whole point is that
 * only the Sample Database (which cannot host transforms) exists. Gating it
 * would be the over-gating sin session 3 measured in the `@python` tier.
 */
test.describe("scenarios > admin > transforms > no supported databases", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    capture = await installSnowplowCapture(page, mb.baseUrl);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
  });

  test.afterEach(async () => {
    if (!capture) {
      return;
    }
    expectNoBadSnowplowEvents(capture);
  });

  test("should show a message when no supported databases are available", async ({
    page,
  }) => {
    // create a new transform
    await visitTransformListPage(page);
    await expect(
      page.getByRole("heading", { name: "No compatible database connection" }),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: "View your database connections" }),
    ).toBeAttached();
  });
});

test.describe("scenarios > data studio > transforms > permissions", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    await resetTransformTargetTables();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
  });

  /**
   * ENVIRONMENT-BLOCKED, measured — not a product-bug claim and not port drift.
   *
   * The `Transforms` permission column is gated by
   * `getShouldShowTransformPermissions`
   * (admin/permissions/selectors/data-permissions/permission-editor.tsx:192),
   * which on a non-hosted instance needs BOTH `transforms-enabled` (the
   * beforeEach sets it) AND the `transforms-basic` TOKEN FEATURE.
   *
   * Measured on this backend right after a beforeEach activated
   * `pro-self-hosted` (`GET /api/session/properties` → `token-features`):
   * `transforms-python: true`, **`transforms-basic: false`**. The local
   * `MB_PRO_SELF_HOSTED_TOKEN` predates the feature — `:transforms-basic` is
   * `^{:added "0.59.0"}` vs `:transforms-python` `"0.57.0"`
   * (premium_features/settings.clj:296-302). The rendered table has exactly
   * six column headers (Database name / View data / Create queries / Download
   * results / Manage table metadata / Manage database) and no Transforms one,
   * so the assertion cannot pass here at any timeout.
   *
   * Same root cause as the `collections › should move transforms between
   * collections` fixme above. Ported verbatim, NOT split (upstream is one
   * test, and dropping the column assertion to salvage the create-a-transform
   * half would be weakening it). A refreshed token un-fixmes both for free.
   */
  test("should allow non-admin users with data-studio permission to create transforms", async ({
    page,
    mb,
  }) => {
    test.fixme();
    // grant data-studio permission to All Users
    await page.goto("/admin/permissions/application");
    // DataPermissionValue enum values inlined as their string literals, the
    // convention the other permissions ports in this package use.
    await updatePermissionsGraph(mb.api, {
      [DATA_GROUP]: {
        [WRITABLE_DB_ID]: {
          transforms: "yes",
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });
    await setUserAsAnalyst(mb.api, NORMAL_USER_ID);

    // Ensure that transform permissions are visible when instance is hosted
    // and transform feature is present
    await page
      .getByRole("tab", { name: "Data", exact: true })
      .click({ force: true });
    await page.getByRole("menuitem", { name: "All Users", exact: true }).click();

    const transformsHeader = page.getByRole("columnheader", {
      name: /Transforms/,
    });
    await transformsHeader.scrollIntoViewIfNeeded();
    await expect(transformsHeader).toBeVisible();

    // sign in as normal user and create a transform
    await mb.signInAsNormalUser();
    await visitTransformListPage(page);
    await button(page, "Create a transform").click();
    await popover(page).getByText("Query builder", { exact: true }).click();

    await pickWritableAnimals(page);

    await button(getQueryEditor(page), "Save").click();
    const dialog = modal(page);
    await clearAndType(nameField(dialog), "Non-admin transform");
    await appendType(tableNameField(dialog), TARGET_TABLE);
    const created = waitForCreateTransform(page);
    await button(dialog, "Save").click();
    await created;

    // Verify transform was created
    await getTransformsNavLink(page).click();
    await expect(
      DataStudio.Transforms.list(page).getByText("Non-admin transform", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

/**
 * Upstream tags this `@OSS` — in CI it runs against an OSS jar. This package
 * only has the EE jar, and the describe never activates a token, so what
 * executes here is "EE build with no premium token". Every assertion in the
 * test is driven by token features (no Transforms permission column, no upsell
 * gem, no Python option), which an untokened EE instance reports identically —
 * but this is NOT the same build upstream exercises. Flagged rather than
 * claimed: see findings-inbox/transforms.md.
 */
test.describe("scenarios > data studio > transforms > permissions > oss", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
  });

  test("should be able to enable transforms in OSS without upsell gem icon", async ({
    page,
  }) => {
    // ensure that transform permissions are not shown
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

    // Check that a known header is present
    await expect(
      page.getByRole("columnheader", { name: "Database name", exact: true }),
    ).toBeVisible();
    // Ensure transform permissions are not displayed
    await expect(
      page.getByRole("columnheader", { name: /Transforms/ }),
    ).toHaveCount(0);

    // Visit data studio page
    await page.goto("/data-studio");
    await expect(DataStudio.nav(page)).toBeVisible();

    // Verify Transforms menu item is visible
    await expect(
      DataStudio.nav(page).getByText("Transforms", { exact: true }),
    ).toBeVisible();

    // Verify no upsell gem icon is displayed in Transforms menu item
    await expect(
      DataStudio.nav(page)
        .getByText("Transforms", { exact: true })
        .locator("xpath=ancestor::a[1]")
        .getByTestId("upsell-gem"),
    ).toHaveCount(0);

    // Verify transforms page is accessible
    await DataStudio.nav(page).getByText("Transforms", { exact: true }).click();

    await button(
      DataStudio.Transforms.enableTransformPage(page),
      "Enable transforms",
    ).click();

    await expect(DataStudio.Transforms.list(page)).toBeVisible();

    // Verify can create transforms in OSS
    const createButton = button(page, "Create a transform");
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Verify Python transforms are not available in OSS. Anchored on the
    // popover having rendered its other options, so the absence is read off a
    // painted menu rather than an unmounted one.
    await expect(
      popover(page).getByText("Query builder", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText(/Python/i)).toHaveCount(0);

    // transform permissions should still not
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

    // Check that a known header is present
    await expect(
      page.getByRole("columnheader", { name: "Database name", exact: true }),
    ).toBeVisible();
    // Ensure transform permissions are not displayed
    await expect(
      page.getByRole("columnheader", { name: /Transforms/ }),
    ).toHaveCount(0);
  });
});

test.describe("scenarios > data studio > transforms > permissions > pro-self-hosted", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
  });

  /**
   * ENVIRONMENT-BLOCKED by the same measured cause as the permissions test
   * above: the trailing "transform permissions should now be visible" assertion
   * needs the `transforms-basic` token feature, which the local
   * `pro-self-hosted` token does not carry (measured:
   * `transforms-python: true`, `transforms-basic: false`).
   *
   * Note that everything BEFORE that assertion passes — the nav item, the
   * absent upsell gem, "Enable transforms", the transforms list and the
   * "Create a transform" button all render. It is specifically the
   * permissions-column half that the token blocks.
   */
  test("should have transforms available in self-hosted pro without upsell gem icon", async ({
    page,
    mb,
  }) => {
    test.fixme();
    await mb.api.activateToken("pro-self-hosted");

    // ensure that transform permissions are not shown
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

    // Check that a known header is present
    await expect(
      page.getByRole("columnheader", { name: "Database name", exact: true }),
    ).toBeVisible();
    // Ensure transform permissions are not displayed
    await expect(
      page.getByRole("columnheader", { name: /Transforms/ }),
    ).toHaveCount(0);

    // Visit data studio page
    await page.goto("/data-studio");
    await expect(DataStudio.nav(page)).toBeVisible();

    // Verify Transforms menu item is visible
    await expect(
      DataStudio.nav(page).getByText("Transforms", { exact: true }),
    ).toBeVisible();

    // Verify no upsell gem icon is displayed in Transforms menu item
    await expect(
      DataStudio.nav(page)
        .getByText("Transforms", { exact: true })
        .locator("xpath=ancestor::a[1]")
        .getByTestId("upsell-gem"),
    ).toHaveCount(0);

    // Verify transforms page is accessible
    await DataStudio.nav(page).getByText("Transforms", { exact: true }).click();
    await button(
      DataStudio.Transforms.enableTransformPage(page),
      "Enable transforms",
    ).click();
    await expect(DataStudio.Transforms.list(page)).toBeVisible();

    // Verify can create transforms in pro-self-hosted
    await expect(button(page, "Create a transform")).toBeVisible();

    // transform permissions should now be visible
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

    // Check that a known header is present
    await expect(
      page.getByRole("columnheader", { name: "Database name", exact: true }),
    ).toBeVisible();
    // Ensure transform permissions are displayed
    const transformsHeader = page.getByRole("columnheader", {
      name: /Transforms/,
    });
    await transformsHeader.scrollIntoViewIfNeeded();
    await expect(transformsHeader).toBeVisible();
  });
});
