/**
 * Playwright port of
 * e2e/test/scenarios/actions/model-actions.cy.spec.js
 *
 * Collision checks (done before writing):
 * - `ls e2e/test/scenarios/actions/` → the only same-basename file is
 *   `model-actions.cy.spec.js`. There is NO `.ts` sibling, and nothing named
 *   `model-actions*` anywhere else under e2e/ (including e2e/test-component/).
 * - `ls tests/` → no existing `model-actions.spec.ts`. The neighbouring
 *   `actions-on-dashboards.spec.ts` is a port of a DIFFERENT source
 *   (`actions/actions-on-dashboards.cy.spec.js`).
 * - Support module is `support/model-actions.ts` — matches the target
 *   basename, NO deviation.
 *
 * Infra tier: QA-DB (@external) throughout — determined by reading the spec,
 * not the tags.
 * - The first describe is tagged `["@external", "@actions"]` and restores the
 *   `postgres-12` snapshot, then builds a model over the QA Postgres
 *   `orders` table (WRITABLE_DB_ID). It never WRITES to the container (its
 *   sample action is `UPDATE ORDERS SET TOTAL = TOTAL`, never executed), but
 *   it does need the container to exist and be synced.
 * - The two dialect describes are tagged `"@external"` and additionally
 *   `resetTestTable` + `queryWritableDB` against `writable_db`, i.e. they are
 *   genuinely writable-DB tests.
 * So: everything is gated on PW_QA_DB_ENABLED. Containers used:
 * `metabase-e2e-postgres-sample` (:5404) and `metabase-e2e-mysql-sample`
 * (:3304) — these ARE the writable hosts (`writable_db` lives inside them).
 *
 * Port notes:
 * - cy.intercept(...).as() + cy.wait("@x") → waitForResponse predicates
 *   registered before the triggering action, awaited after (rule 2). The
 *   never-awaited aliases (`getModelAction`, `fetchMetadata`, `getArchived`,
 *   `getSearchResults`, `getDatabase`) are dropped.
 * - cy.wait(["@createAction", ×3]) → a response counter (three concurrent
 *   waitForResponse promises on one predicate all resolve on the first hit).
 * - findByText / findByLabelText / findByRole(name) with string args are EXACT
 *   in testing-library → `{ exact: true }` everywhere (rule 1).
 * - cy.onlyOn(dialect === "postgres") → test.skip(dialect !== "postgres").
 * - cy.signInAsImpersonatedUser() has no harness equivalent (the USERS map has
 *   no "impersonated" entry) → signInWithCachedSession(context, "impersonated").
 *   That test makes no API calls as the impersonated user, so the api client
 *   deliberately stays on admin (as it is in Cypress after cy.signIn too — the
 *   remaining cy.request calls there all precede the sign-in).
 * - H.queryWritableDB / H.resetTestTable / H.createModelFromTableName /
 *   H.createAction are imported from support/actions-on-dashboards.ts (the
 *   knex plumbing for the writable container already lives there).
 *
 * Known upstream quirk ported verbatim (see the inline comment): the last
 * public-sharing test asserts `findByLabelText("Create At")` does not exist —
 * a typo for "Created At". Both spellings are absent once the field is hidden,
 * so the assertion is true either way; it is NOT load-bearing. Ported as-is
 * with the analysis inline rather than "fixed", per the faithfulness rule.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import {
  createAction,
  createModelFromTableName,
  queryWritableDB,
  resetTestTable,
} from "../support/actions-on-dashboards";
import type { WritebackDialect } from "../support/actions-on-dashboards";
import {
  IMPERSONATED_USER_ID,
  actionList,
  actionListItem,
  assertQueryEditorDisabled,
  createBasicActions,
  createImplicitActions,
  disableSharingFor,
  enableSharingFor,
  fillActionQuery,
  formFieldContainer,
  getCreatePostgresRoleIfNotExistSql,
  isExecuteAction,
  isGetModel,
  isUpdateAction,
  openActionEditorFor,
  openActionMenuFor,
  recordGetAction,
  resetAndVerifyScoreValue,
  runActionFor,
  waitForGetAction,
  USER_GROUPS,
  updatePermissionsGraph,
  verifyScoreValue,
} from "../support/model-actions";
import { findByDisplayValue } from "../support/filters-repros";
import { signInWithCachedSession } from "../support/permissions";
import { SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { setActionsEnabledForDB, startNewAction } from "../support/command-palette";
import { icon, modal, popover } from "../support/ui";

const WRITABLE_TEST_TABLE = "scoreboard_actions";

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

/**
 * Port of the spec's createMockActionParameter(...) call — the mock factory
 * fills in `type: "category"` etc., all of which this spec overrides.
 */
const TEST_PARAMETER = {
  id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
  name: "Total",
  slug: "total",
  type: "number/=",
  target: ["variable", ["template-tag", "total"]],
};

const TEST_TEMPLATE_TAG = {
  id: TEST_PARAMETER.id,
  type: "number",
  name: TEST_PARAMETER.slug,
  "display-name": TEST_PARAMETER.name,
  slug: TEST_PARAMETER.slug,
};

const SAMPLE_QUERY_ACTION = {
  name: "Demo Action",
  type: "query",
  parameters: [TEST_PARAMETER],
  database_id: WRITABLE_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
      },
    },
    database: WRITABLE_DB_ID,
  },
  visualization_settings: {
    fields: {
      [TEST_PARAMETER.id]: {
        id: TEST_PARAMETER.id,
        required: true,
        fieldType: "number",
        inputType: "number",
      },
    },
  },
};

/** icepick assocIn(SAMPLE_QUERY_ACTION, ["dataset_query","native","query"], …). */
const SAMPLE_WRITABLE_QUERY_ACTION = {
  ...SAMPLE_QUERY_ACTION,
  dataset_query: {
    ...SAMPLE_QUERY_ACTION.dataset_query,
    native: {
      ...SAMPLE_QUERY_ACTION.dataset_query.native,
      query: `UPDATE ${WRITABLE_TEST_TABLE} SET score = 22 WHERE id = {{ ${TEST_TEMPLATE_TAG.name} }}`,
    },
  },
};

const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA databases (postgres :5404 / mysql :3304) and the postgres-12 / ${dialect}-writable snapshots (set PW_QA_DB_ENABLED)",
  );

/** cy.visit(url) + cy.wait("@getModel"), with the wait registered first. */
async function visitAndWaitForModel(page: Page, url: string) {
  const getModel = page.waitForResponse(isGetModel);
  await page.goto(url);
  await getModel;
}

/**
 * "The action editor closes after the update; wait until it is gone before
 * asserting on the action list behind it." — upstream's own comment.
 */
async function waitForActionEditorClosed(page: Page) {
  await expect(page.getByTestId("action-creator")).toHaveCount(0);
}

test.describe("scenarios > models > actions", () => {
  // @external + @actions: the whole describe drives the QA Postgres database.
  skipUnlessQaDb();

  let modelId: number;

  test.beforeEach(async ({ mb, page }) => {
    recordGetAction(page);
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, WRITABLE_DB_ID);

    modelId = await createModelFromTableName(mb.api, {
      tableName: "orders",
      modelName: "Order",
    });
  });

  test("should allow CRUD operations on model actions", async ({ page }) => {
    await visitAndWaitForModel(page, `/model/${modelId}/detail`);

    await createBasicActions(page);

    const list = actionList(page);
    await expect(
      list.locator("li").nth(0).getByText("Create", { exact: true }),
    ).toBeVisible();
    await expect(
      list.locator("li").nth(1).getByText("Update", { exact: true }),
    ).toBeVisible();
    await expect(
      list.locator("li").nth(2).getByText("Delete", { exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "New action", exact: true }).click();
    await fillActionQuery(page, "DELETE FROM orders WHERE id = {{ id }}");
    await page
      .getByRole("radiogroup", { name: "Field type", exact: true })
      .getByText("Number", { exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const saveModal = modal(page).nth(1);
    await saveModal.getByLabel("Name", { exact: true }).fill("Delete Order");
    await saveModal.getByRole("button", { name: "Create", exact: true }).click();

    await expect(
      actionList(page).getByText("Delete Order", { exact: true }),
    ).toBeVisible();

    await openActionEditorFor(page, "Delete Order");
    await fillActionQuery(page, " AND status = 'pending'");
    await expect(
      page
        .getByRole("radiogroup", { name: "Field type", exact: true })
        .getByLabel("Number", { exact: true }),
    ).toBeChecked();

    const updated = page.waitForResponse(isUpdateAction);
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await updated;
    await waitForActionEditorClosed(page);

    await expect(
      actionList(page).getByText(
        "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
        { exact: true },
      ),
    ).toBeVisible();

    await openActionMenuFor(page, "Delete Order");
    await popover(page).getByText("Archive", { exact: true }).click();

    const archiveModal = modal(page);
    await expect(
      archiveModal.getByText("Archive Delete Order?", { exact: true }),
    ).toBeVisible();
    await archiveModal
      .getByRole("button", { name: "Archive", exact: true })
      .click();

    await expect(actionListItem(page, "Delete Order")).toHaveCount(0);

    await page
      .getByTestId("model-actions-header")
      .getByLabel("Actions", { exact: true })
      .click();
    await popover(page)
      .getByText("Disable basic actions", { exact: true })
      .click();
    const disableModal = modal(page);
    await expect(
      disableModal.getByText("Disable basic actions?", { exact: true }),
    ).toBeVisible();
    await disableModal
      .getByRole("button", { name: "Disable", exact: true })
      .click();

    const mainRegion = page.getByRole("main");
    await expect(
      mainRegion.getByLabel("Action list", { exact: true }),
    ).toHaveCount(0);
    await expect(mainRegion.getByText("Create", { exact: true })).toHaveCount(0);
    await expect(mainRegion.getByText("Update", { exact: true })).toHaveCount(0);
    await expect(mainRegion.getByText("Delete", { exact: true })).toHaveCount(0);
  });

  test("should respect permissions", async ({ page, mb }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Needs the pro-self-hosted token (H.activateToken)",
    );

    // Enabling actions for sample database as well
    // to test database picker behavior in the action editor
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);

    await mb.api.activateToken("pro-self-hosted");
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [DATA_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });

    await createAction(mb.api, {
      ...SAMPLE_QUERY_ACTION,
      model_id: modelId,
    });

    await mb.signIn("readonly");
    await visitAndWaitForModel(page, `/model/${modelId}/detail/actions`);

    await openActionMenuFor(page, SAMPLE_QUERY_ACTION.name);
    const menu = popover(page);
    await expect(menu.getByText("Archive", { exact: true })).toHaveCount(0);
    await menu.getByText("View", { exact: true }).click();

    const dialog = page.getByRole("dialog");
    // cy.findByDisplayValue(name) — the CURRENT value, which a CSS
    // `input[value=…]` attribute selector does NOT read (React sets the
    // property, not the attribute). Scoped to the dialog, per the
    // page-wide-findByDisplayValue flake rule in PORTING.
    await expect(
      await findByDisplayValue(dialog, SAMPLE_QUERY_ACTION.name),
    ).toBeDisabled();

    await expect(
      dialog.getByText("Sample Database", { exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByText("QA Postgres12", { exact: true })).toHaveCount(
      0,
    );

    await expect(
      dialog.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Update", exact: true }),
    ).toHaveCount(0);

    await assertQueryEditorDisabled(page);

    await expect(icon(dialog.getByRole("form"), "gear")).toHaveCount(0);

    await dialog.getByLabel("Action settings", { exact: true }).click();
    await expect(
      dialog.getByLabel("Success message", { exact: true }),
    ).toBeDisabled();

    await mb.signIn("normal");
    await page.reload();

    // Check can pick between all databases
    await page
      .getByRole("dialog")
      .getByText("QA Postgres12", { exact: true })
      .click();
    const dbPicker = popover(page);
    await expect(
      dbPicker.getByText("Sample Database", { exact: true }),
    ).toBeVisible();
    await expect(
      dbPicker.getByText("QA Postgres12", { exact: true }),
    ).toBeVisible();

    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID, false);
    await mb.signIn("normal");
    await page.reload();

    // Check can only see the action database
    const reloadedDialog = page.getByRole("dialog");
    await reloadedDialog.getByText("QA Postgres12", { exact: true }).click();
    await expect(
      reloadedDialog.getByText("Sample Database", { exact: true }),
    ).toHaveCount(0);
  });

  test("should display parameters for variable template tags only", async ({
    page,
  }) => {
    await page.goto("/");
    await startNewAction(page);

    await fillActionQuery(page, "{{#1-orders-model}}");
    await expect(
      page.getByLabel("#1-orders-model", { exact: true }),
    ).toHaveCount(0);

    await fillActionQuery(page, "{{snippet:101}}");
    await expect(
      page.getByLabel("#1-orders-model", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("101", { exact: true })).toHaveCount(0);

    await fillActionQuery(page, "{{id}}");
    await expect(
      page.getByLabel("#1-orders-model", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("101", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("ID", { exact: true })).toBeVisible();
  });

  test("should show detailed form errors for constraint violations when executing model actions", async ({
    page,
    mb,
  }) => {
    const actionName = "Update";

    await createImplicitActions(mb.api, { modelId });
    await visitAndWaitForModel(page, `/model/${modelId}/detail`);

    await runActionFor(page, actionName);

    const runModal = modal(page);
    await runModal.getByLabel("ID", { exact: true }).fill("1");
    await runModal.getByLabel("User ID", { exact: true }).fill("999999");
    const executed = page.waitForResponse(isExecuteAction);
    await runModal.getByRole("button", { name: actionName, exact: true }).click();
    await executed;

    await expect(runModal.getByLabel("User ID", { exact: true })).toHaveCount(1);
    await expect(
      runModal.getByText('This value does not exist in table "people".', {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      runModal.getByText("Unable to update the record.", { exact: true }),
    ).toHaveCount(1);
  });
});

for (const dialect of ["postgres", "mysql"] as WritebackDialect[]) {
  test.describe(`Write actions on model detail page (${dialect})`, () => {
    // @external: restores the ${dialect}-writable snapshot and writes to the
    // writable QA container.
    skipUnlessQaDb();

    let writableModelId: number;

    test.beforeEach(async ({ mb, page }) => {
      recordGetAction(page);
      await mb.restore(`${dialect}-writable`);
      await resetTestTable({ type: dialect, table: WRITABLE_TEST_TABLE });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [WRITABLE_TEST_TABLE],
      });

      writableModelId = await createModelFromTableName(mb.api, {
        tableName: WRITABLE_TEST_TABLE,
      });
    });

    test("should allow action execution from the model detail page", async ({
      page,
      mb,
    }) => {
      await verifyScoreValue(0, dialect);

      await createAction(mb.api, {
        ...SAMPLE_WRITABLE_QUERY_ACTION,
        model_id: writableModelId,
      });
      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      await runActionFor(page, SAMPLE_QUERY_ACTION.name);

      const runModal = modal(page);
      await runModal.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await runModal
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();

      await expect(
        page
          .getByTestId("toast-undo")
          .getByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`, {
            exact: true,
          }),
      ).toBeVisible();

      await verifyScoreValue(22, dialect);
    });

    test("should allow public sharing of actions and execution of public actions", async ({
      page,
      mb,
    }) => {
      const IMPLICIT_ACTION_NAME = "Update";

      await createAction(mb.api, {
        ...SAMPLE_WRITABLE_QUERY_ACTION,
        model_id: writableModelId,
      });
      await createAction(mb.api, {
        type: "implicit",
        kind: "row/update",
        name: IMPLICIT_ACTION_NAME,
        model_id: writableModelId,
      });
      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      const queryActionPublicUrl = await enableSharingFor(
        page,
        SAMPLE_WRITABLE_QUERY_ACTION.name,
      );
      const implicitActionPublicUrl = await enableSharingFor(
        page,
        IMPLICIT_ACTION_NAME,
      );

      await mb.signOut();

      await page.goto(queryActionPublicUrl);
      await page.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await page
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();
      await expect(
        page.getByText(
          `${SAMPLE_WRITABLE_QUERY_ACTION.name} ran successfully`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByRole("form")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true }),
      ).toHaveCount(0);

      await verifyScoreValue(22, dialect);

      await page.goto(implicitActionPublicUrl);

      // team 2 has 10 points, let's give them more
      await page.getByLabel("ID", { exact: true }).fill("2");
      await page.getByLabel(/score/i).fill("16");
      await page.getByLabel(/team name/i).fill("Bouncy Bears");

      await page
        .getByRole("button", { name: IMPLICIT_ACTION_NAME, exact: true })
        .click();
      await expect(
        page.getByText(`${IMPLICIT_ACTION_NAME} ran successfully`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("form")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: IMPLICIT_ACTION_NAME, exact: true }),
      ).toHaveCount(0);

      const updatedRow = (
        await queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 2`,
          dialect,
        )
      ).rows[0];
      expect(updatedRow.score).toBe(16);
      expect(updatedRow.team_name).toBe("Bouncy Bears");
      // should not mutate form fields that we don't touch
      expect(updatedRow.status).not.toBeNull();

      await mb.signInAsAdmin();
      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      await disableSharingFor(page, SAMPLE_QUERY_ACTION.name);
      await disableSharingFor(page, IMPLICIT_ACTION_NAME);

      await mb.signOut();

      for (const url of [queryActionPublicUrl, implicitActionPublicUrl]) {
        await page.goto(url);
        await expect(page.getByRole("form")).toHaveCount(0);
        await expect(
          page.getByRole("button", {
            name: SAMPLE_QUERY_ACTION.name,
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Not found", { exact: true }),
        ).toBeVisible();
      }
    });

    test("should allow query action execution from the model details page", async ({
      page,
      mb,
    }) => {
      await verifyScoreValue(0, dialect);

      await createAction(mb.api, {
        ...SAMPLE_WRITABLE_QUERY_ACTION,
        model_id: writableModelId,
      });
      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      await openActionEditorFor(page, SAMPLE_QUERY_ACTION.name);

      await fillActionQuery(page, " [[and status = {{ current_status}}]]");
      const currentStatusField = formFieldContainer(page, "Current Status");
      await currentStatusField
        .getByLabel("Show field", { exact: true })
        .click();
      await icon(currentStatusField, "gear").click();

      await popover(page)
        .getByLabel("Required", { exact: true })
        .uncheck({ force: true });

      let updated = page.waitForResponse(isUpdateAction);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updated;
      await waitForActionEditorClosed(page);

      await runActionFor(page, SAMPLE_QUERY_ACTION.name);

      let runModal = modal(page);
      await runModal.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await expect(
        runModal.getByLabel("Current Status", { exact: true }),
      ).toHaveCount(0);
      await runModal
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();

      await expect(
        page
          .getByTestId("toast-undo")
          .getByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`, {
            exact: true,
          }),
      ).toBeVisible();

      await verifyScoreValue(22, dialect);

      await openActionEditorFor(page, SAMPLE_QUERY_ACTION.name);

      await icon(formFieldContainer(page, "Current Status"), "gear").click();
      await popover(page)
        .getByLabel("Required", { exact: true })
        .check({ force: true });

      updated = page.waitForResponse(isUpdateAction);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updated;
      await waitForActionEditorClosed(page);

      await runActionFor(page, SAMPLE_QUERY_ACTION.name);

      runModal = modal(page);
      await runModal.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await expect(
        runModal.getByLabel("Current Status", { exact: true }),
      ).toHaveCount(0);
      await expect(
        runModal.getByRole("button", {
          name: SAMPLE_QUERY_ACTION.name,
          exact: true,
        }),
      ).toBeDisabled();
      await runModal
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      await openActionEditorFor(page, SAMPLE_QUERY_ACTION.name);

      // reset score value to 0
      await resetAndVerifyScoreValue(dialect);

      const editorDialog = page.getByRole("dialog");
      const statusField = formFieldContainer(editorDialog, "Current Status");
      await statusField.getByLabel("Show field", { exact: true }).click();
      await expect(
        statusField.getByLabel("Show field", { exact: true }),
      ).toBeChecked();
      updated = page.waitForResponse(isUpdateAction);
      await editorDialog
        .getByRole("button", { name: "Update", exact: true })
        .click();
      await updated;
      await waitForActionEditorClosed(page);

      await runActionFor(page, SAMPLE_QUERY_ACTION.name);

      runModal = modal(page);
      await runModal.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await expect(
        runModal.getByRole("button", {
          name: SAMPLE_QUERY_ACTION.name,
          exact: true,
        }),
      ).toBeDisabled();

      await runModal
        .getByLabel("Current Status", { exact: true })
        .fill("active");

      // Upstream reads the DB straight after this click with no wait at all —
      // every other DB read-back in the spec is preceded by a toast/text
      // assertion that supplies the settle, but this last one is not, so
      // Cypress was relying on incidental command-queue + cy.task latency.
      // Ported with the execute response as the anchor (not a sleep); measured:
      // without it the mysql leg read score=0 while postgres happened to win
      // the race.
      const executed = page.waitForResponse(isExecuteAction);
      await runModal
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();
      await executed;

      await verifyScoreValue(22, dialect);
    });

    test("should allow implicit action execution from the model details page", async ({
      page,
    }) => {
      await visitAndWaitForModel(page, `/model/${writableModelId}/detail`);

      await createBasicActions(page);

      await openActionEditorFor(page, "Create");
      const actionBody = (await (await waitForGetAction(page)).json()) as {
        parameters: unknown[];
        visualization_settings: Record<string, unknown>;
      };
      expect(actionBody.parameters).toHaveLength(5);
      expect(actionBody.visualization_settings).toHaveProperty("fields");

      const createdAtField = formFieldContainer(page, "Created At");
      await createdAtField.getByLabel("Show field", { exact: true }).click();
      await expect(
        createdAtField.getByLabel("Show field", { exact: true }),
      ).not.toBeChecked();

      const updated = page.waitForResponse(isUpdateAction);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updated;
      await waitForActionEditorClosed(page);

      await runActionFor(page, "Create");

      const runModal = modal(page);
      await expect(
        runModal.getByLabel("Created At", { exact: true }),
      ).toHaveCount(0);
      await runModal.getByLabel("Team Name", { exact: true }).fill("Zebras");
      await runModal.getByLabel("Score", { exact: true }).fill("1");
      await runModal.getByRole("button", { name: "Save", exact: true }).click();

      await expect(
        page
          .getByTestId("toast-undo")
          .getByText("Successfully saved", { exact: true }),
      ).toBeVisible();

      const result = await queryWritableDB(
        `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE team_name = 'Zebras'`,
        dialect,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(1);
    });

    test("should allow public sharing of query action and execution", async ({
      page,
      mb,
    }) => {
      await createAction(mb.api, {
        ...SAMPLE_WRITABLE_QUERY_ACTION,
        model_id: writableModelId,
      });
      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      const queryActionPublicUrl = await enableSharingFor(
        page,
        SAMPLE_WRITABLE_QUERY_ACTION.name,
      );

      await openActionEditorFor(page, SAMPLE_WRITABLE_QUERY_ACTION.name);

      await fillActionQuery(page, " [[ AND status = {{new_status}} ]]");

      const newStatusField = formFieldContainer(page, "New Status");
      await newStatusField.getByLabel("Show field", { exact: true }).click();
      await expect(
        newStatusField.getByLabel("Show field", { exact: true }),
      ).not.toBeChecked();
      await icon(newStatusField, "gear").click();

      await popover(page)
        .getByLabel("Required", { exact: true })
        .uncheck({ force: true });

      const updated = page.waitForResponse(isUpdateAction);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updated;
      await waitForActionEditorClosed(page);

      await mb.signOut();

      await page.goto(queryActionPublicUrl);
      await page.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await expect(
        page.getByLabel("New Status", { exact: true }),
      ).toHaveCount(0);

      await page
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();

      await expect(
        page.getByText(
          `${SAMPLE_WRITABLE_QUERY_ACTION.name} ran successfully`,
          { exact: true },
        ),
      ).toBeVisible();

      await verifyScoreValue(22, dialect);
    });

    test("should allow public sharing of implicit action and execution", async ({
      page,
      mb,
    }) => {
      await visitAndWaitForModel(page, `/model/${writableModelId}/detail`);

      await createBasicActions(page);

      const updatePublicURL = await enableSharingFor(page, "Update");

      await openActionEditorFor(page, "Update");

      const createdAtField = formFieldContainer(page, "Created At");
      await createdAtField.getByLabel("Show field", { exact: true }).click();
      await expect(
        createdAtField.getByLabel("Show field", { exact: true }),
      ).not.toBeChecked();

      const updated = page.waitForResponse(isUpdateAction);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updated;
      await waitForActionEditorClosed(page);

      await mb.signOut();

      await page.goto(updatePublicURL);

      // team 2 has 10 points, let's give them more
      await page.getByLabel("ID", { exact: true }).fill("2");
      await page.getByLabel("Score", { exact: true }).fill("16");
      await page.getByLabel("Team Name", { exact: true }).fill("Bouncy Bears");
      // NOTE: upstream asserts `findByLabelText("Create At")` — a typo for
      // "Created At". Ported verbatim (faithfulness rule). It cannot fail:
      // neither spelling exists once the field is hidden, and "Create At" is
      // not a label the app ever renders, so this assertion is vacuous
      // upstream too.
      await expect(page.getByLabel("Create At", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Update", exact: true }).click();

      await expect(
        page.getByText("Update ran successfully", { exact: true }),
      ).toBeVisible();

      const row = (
        await queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 2`,
          dialect,
        )
      ).rows[0];
      expect(row.score).toBe(16);
      expect(row.team_name).toBe("Bouncy Bears");
    });

    test("should respect impersonated permission", async ({
      page,
      mb,
      context,
    }) => {
      test.skip(dialect !== "postgres", "cy.onlyOn(dialect === 'postgres')");
      test.skip(
        !resolveToken("pro-self-hosted"),
        "Needs the pro-self-hosted token (H.activateToken)",
      );

      const role = "readonly_role";
      const sql = getCreatePostgresRoleIfNotExistSql(
        role,
        `GRANT SELECT ON ${WRITABLE_TEST_TABLE} TO ${role};`,
      );
      await mb.api.activateToken("pro-self-hosted");
      await queryWritableDB(sql, dialect);

      await mb.api.put(`/api/user/${IMPERSONATED_USER_ID}`, {
        login_attributes: { role },
      });

      await updatePermissionsGraph(
        mb.api,
        {
          [ALL_USERS_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "impersonated",
              "create-queries": "query-builder-and-native",
            },
          },
          // By default, all groups get `unrestricted` access that will override
          // the impersonation.
          [COLLECTION_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "blocked",
            },
          },
        },
        [
          {
            db_id: WRITABLE_DB_ID,
            group_id: ALL_USERS_GROUP,
            attribute: "role",
          },
        ],
      );

      await verifyScoreValue(0, dialect);

      await createAction(mb.api, {
        ...SAMPLE_WRITABLE_QUERY_ACTION,
        model_id: writableModelId,
      });

      // cy.signInAsImpersonatedUser() — "impersonated" is outside the harness
      // USERS map, so use its cached snapshot session for both the browser and
      // (for symmetry with cy.request) the API client.
      await signInWithCachedSession(context, "impersonated");

      await visitAndWaitForModel(
        page,
        `/model/${writableModelId}/detail/actions`,
      );

      await runActionFor(page, SAMPLE_QUERY_ACTION.name);

      const runModal = modal(page);
      await runModal.getByLabel(TEST_PARAMETER.name, { exact: true }).fill("1");
      await runModal
        .getByRole("button", { name: SAMPLE_QUERY_ACTION.name, exact: true })
        .click();

      await expect(
        runModal.getByText(
          `Error executing Action: Error executing write query: ERROR: permission denied for table ${WRITABLE_TEST_TABLE}`,
          { exact: true },
        ),
      ).toBeVisible({ timeout: 30000 });

      await verifyScoreValue(0, dialect);
    });
  });
}
