/**
 * Playwright port of
 * e2e/test/scenarios/actions/actions-reproductions.cy.spec.js
 *
 * Collision checks (done BEFORE writing anything):
 * - `grep -rl "actions-reproductions" tests/ support/` → no hits. No existing
 *   port names this source.
 * - `ls tests/` → no `actions-reproductions.spec.ts`. The neighbouring
 *   `actions-on-dashboards.spec.ts` / `model-actions.spec.ts` are ports of
 *   DIFFERENT sources.
 * - `ls e2e/test/scenarios/actions/` → four files, all `.cy.spec.js`; there is
 *   NO `.ts` sibling of `actions-reproductions`. `e2e/test-component/` contains
 *   only `scenarios/`, with nothing of this basename.
 *   PORTED FILE: `e2e/test/scenarios/actions/actions-reproductions.cy.spec.js`.
 * - Support module is `support/actions-reproductions.ts` — matches the target
 *   basename, NO deviation.
 *
 * ── Infra tier: determined by READING the spec, not by the tags ─────────────
 * The upstream tags are wrong in both directions here:
 *
 * - `describe("metabase#31587")`  — untagged, `H.restore()` (default snapshot),
 *   sample DB only. Correct: needs no container.
 * - `describe("Issue 32974")`     — tagged `["@external", "@actions"]`,
 *   restores `postgres-writable` and WRITES to `writable_db` via an UPDATE
 *   action. Correct, and it genuinely touches the SHARED writable container.
 * - `describe("issue 51020") > "when primary key is called 'id'"` —
 *   **UNTAGGED, but it restores `postgres-writable`, CREATEs/DROPs a table in
 *   the writable container via H.queryWritableDB and resyncs it.** The missing
 *   `@external` tag is an upstream bug; gated here anyway (a tag cannot make a
 *   container appear).
 * - `describe("issue 51020") > "when primary key is not called 'id'"` —
 *   tagged `@external`. Same shape as its sibling. Correct.
 * - `describe("issue 32840")` / `describe("issue 32750")` — untagged, default
 *   snapshot, sample DB only. Correct.
 *
 * So: 3 of the 5 top-level describes run on the bare `default` snapshot and 2
 * need the writable QA Postgres container (`metabase-e2e-postgres-sample-1`,
 * `writable_db` on :5404 — that container IS the writable host). Only the QA-DB
 * describes are gated on PW_QA_DB_ENABLED; the sample-DB ones always run.
 *
 * Snapshots restored, per describe:
 *   metabase#31587 → "default"            (no container)
 *   Issue 32974    → "postgres-writable"  (SHARED writable container — writes)
 *   issue 51020 ×2 → "postgres-writable"  (SHARED writable container — DDL)
 *   issue 32840    → "default"            (no container)
 *   issue 32750    → "default"            (no container)
 *
 * Shared-DB state created and how it is restored:
 * - Issue 32974 `resetTestTable({type:"postgres", table:"scoreboard_actions"})`
 *   drops + rebuilds `public.scoreboard_actions` — the same table
 *   model-actions/actions-on-dashboards rebuild, i.e. it restores itself on
 *   every beforeEach. The action then sets row 1's score to 999; the next
 *   `resetTestTable` wipes that.
 * - issue 51020 creates `public.foo` and drops it in an afterEach (upstream's
 *   own teardown), guarded on the same gate as the beforeEach so a gate-OFF
 *   control reports 2 SKIPPED rather than 2 FAILED (PORTING: "an afterEach runs
 *   even when a skipped beforeEach short-circuits").
 * - No foreign schema is ever dropped (PORTING #85 — sibling slots are live).
 *
 * ── Port notes ──────────────────────────────────────────────────────────────
 * - Issue 32974's three `cy.intercept(...).as()` aliases (`getModelActions`,
 *   `executeAction`, `prefetchValues`) are NEVER awaited by its single test →
 *   dropped (rule 2). issue 51020's second describe aliases `dataset`,
 *   `createCard`, `getCard`, all of which ARE awaited → ported as
 *   `waitForResponse` registered before the trigger. issue 32840's
 *   `executeAction` is awaited → ported.
 * - findByText / findByLabelText / findByRole(name) / cy.button with string
 *   args are EXACT in testing-library → `{ exact: true }` everywhere (rule 1).
 * - `cy.viewport(w, h)` → `page.setViewportSize({ width, height })`.
 * - `H.getTable`/`H.getTableId` are ported with the schema PINNED to `public`
 *   (see support/actions-reproductions.ts) — a deliberate narrowing against
 *   PORTING #85 debris in the shared container, never a widening.
 * - `H.resyncDatabase({ dbId, tableName: X })` ≡ `{ tables: [X] }` (upstream's
 *   waitForSyncToFinish treats the two identically), so the shared
 *   `resyncDatabase(api, { dbId, tables: [X] })` is the faithful port. The
 *   stale-`initial_sync_status` hole (PORTING) does NOT apply here: the
 *   `postgres_writable` snapshot contains **zero** rows for either
 *   `scoreboard_actions` or `foo` (checked: `grep -c scoreboard_actions
 *   e2e/snapshots/postgres_writable.sql` → 0), so both waits are genuine.
 * - `cy.type()` on a PRE-FILLED input appends at the end; Playwright's click
 *   drops the caret wherever the pointer landed → `appendToInput` (click +
 *   End + pressSequentially). See support/actions-reproductions.ts.
 * - `H.getDashboardCard(0).should("contain.text", "Foo Baz")` has a SINGLE
 *   element subject, so chai-jquery's concatenation-vs-any-of distinction does
 *   not bite; `toContainText` is the faithful port.
 * - `.realHover()` before `cy.icon("click")` → a real `hover()`, re-issued
 *   immediately before the click (PORTING: the parked-cursor gotcha inverts for
 *   hover-gated controls).
 */
import type { Page } from "@playwright/test";

import {
  aside,
  createAction,
  queryWritableDB,
  resetTestTable,
} from "../support/actions-on-dashboards";
import {
  actionButtonContainer,
  appendToInput,
  createModelFromTable,
  dashCard,
  getTable,
  scrollHeightOf,
  setupBasicActionsInModel,
} from "../support/actions-reproductions";
import { updateDashboardCards } from "../support/click-behavior";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  selectDropdown,
} from "../support/dashboard";
import { createDashboard } from "../support/factories";
import { setActionsEnabledForDB, startNewAction } from "../support/command-palette";
import { expect, test } from "../support/fixtures";
import {
  findByDisplayValue,
  visitDashboardWithParams,
} from "../support/filters-repros";
import { miniPickerBrowseAll } from "../support/joins";
import { undoToast } from "../support/metrics";
import {
  USER_GROUPS,
  createImplicitActions,
  updatePermissionsGraph,
} from "../support/model-actions";
import { entityPickerModal } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import { saveQuestion } from "../support/sharing";
import { icon, modal, newButton, popover, visitDashboard } from "../support/ui";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const viewports: [number, number][] = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];

const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA Postgres database (writable_db on :5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

test.describe("metabase#31587", () => {
  for (const [width, height] of viewports) {
    test.describe(`Testing on resolution ${width} x ${height}`, () => {
      test.beforeEach(async ({ mb, page }) => {
        await mb.restore();
        await mb.signInAsAdmin();
        await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
        await page.setViewportSize({ width, height });
      });

      test("should not allow action buttons to overflow when editing dashboard", async ({
        mb,
        page,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
        await editDashboard(page);
        await page
          .getByRole("button", { name: "Add action", exact: true })
          .click();

        const scope = page.getByTestId("dashboard-parameters-and-cards");
        const button = actionButtonContainer(scope);
        await expect(button).toBeVisible();
        const card = await dashCard(scope);

        expect(await scrollHeightOf(button)).toBe(await scrollHeightOf(card));
      });

      test("should not allow action buttons to overflow when viewing info sidebar", async ({
        mb,
        page,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
        await editDashboard(page);
        await page.getByLabel("Add action", { exact: true }).click();

        // Anchor the save on the change it saves (PORTING): the action dashcard
        // must be applied before Save, or the dashboard isn't dirty and the PUT
        // never fires.
        await expect(
          actionButtonContainer(
            page.getByTestId("dashboard-parameters-and-cards"),
          ),
        ).toBeVisible();
        await saveDashboard(page);
        await icon(page, "info").click();

        const scope = page.getByTestId("dashboard-parameters-and-cards");
        const button = actionButtonContainer(scope);
        await expect(button).toBeVisible();
        const card = await dashCard(scope);

        expect(await scrollHeightOf(button)).toBe(await scrollHeightOf(card));
      });
    });
  }
});

test.describe("Issue 32974", () => {
  // @external + @actions — restores postgres-writable and WRITES to the shared
  // writable container.
  skipUnlessQaDb();

  const { ALL_USERS_GROUP } = USER_GROUPS;

  const TEST_TABLE = "scoreboard_actions";

  /**
   * Port of createMockActionParameter({...}) — every default of the mock
   * factory (`type: "type/Integer"`, the derived `target`) is overridden by the
   * spec's own arguments, so the literal below is the exact resulting object.
   */
  const ID_ACTION_PARAMETER = {
    id: "86981cc2-2589-44b5-b559-2c8bbf5bb36a",
    name: "ID",
    slug: "id",
    type: "number/=",
    target: ["variable", ["template-tag", "id"]],
  };

  /** Port of createMockParameter({...}) — same reasoning. */
  const ID_DASHBOARD_PARAMETER = {
    name: "ID",
    slug: "id",
    id: "9da7bdd3",
    type: "id",
    sectionId: "id",
  };

  const DASHBOARD_DETAILS = {
    name: "action dashboard",
    parameters: [ID_DASHBOARD_PARAMETER],
  };

  const EXPECTED_UPDATED_VALUE = 999;

  const QUERY_ACTION = {
    name: "Query action",
    type: "query",
    parameters: [ID_ACTION_PARAMETER],
    database_id: WRITABLE_DB_ID,
    dataset_query: {
      type: "native",
      native: {
        query: `UPDATE ${TEST_TABLE} SET SCORE = ${EXPECTED_UPDATED_VALUE} WHERE ID = {{ ${ID_ACTION_PARAMETER.slug} }}`,
        "template-tags": {
          [ID_ACTION_PARAMETER.slug]: {
            id: ID_ACTION_PARAMETER.id,
            "display-name": ID_ACTION_PARAMETER.name,
            name: ID_ACTION_PARAMETER.slug,
            type: "text",
          },
        },
      },
      database: WRITABLE_DB_ID,
    },
    visualization_settings: {
      fields: {
        [ID_ACTION_PARAMETER.id]: {
          id: ID_ACTION_PARAMETER.id,
          required: true,
          fieldType: "number",
          inputType: "number",
        },
      },
    },
  };

  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: TEST_TABLE });

    await mb.signInAsAdmin();

    // --- setupWritableDB() ---
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TEST_TABLE],
    });
    const table = await getTable(mb.api, {
      databaseId: WRITABLE_DB_ID,
      name: TEST_TABLE,
    });
    const modelId = await createModelFromTable(mb.api, { tableId: table.id });
    await setActionsEnabledForDB(mb.api, WRITABLE_DB_ID, true);

    // --- setupDashboardAndAction() ---
    const fieldId = table.fields.find((field) => field.name === "id")?.id;
    if (fieldId == null) {
      throw new Error(`No "id" field on ${TEST_TABLE}`);
    }

    await createImplicitActions(mb.api, { modelId });
    const { id: actionId } = await createAction(mb.api, {
      ...QUERY_ACTION,
      model_id: modelId,
    });

    const dashboard = await createDashboard(mb.api, DASHBOARD_DETAILS);
    dashboardId = dashboard.id;

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardId,
      cards: [
        {
          // Explicit ids: H.getNextUnsavedDashboardCardId() and
          // getActionCardDetails' own counter both mint -1 first, and
          // duplicate dashcard ids are a 400 (PORTING, wave 12).
          id: -1,
          card_id: modelId,
          // Map dashboard parameter to the table's id field
          parameter_mappings: [
            {
              parameter_id: ID_DASHBOARD_PARAMETER.id,
              card_id: modelId,
              target: ["dimension", ["field-id", fieldId, null]],
            },
          ],
        },
        {
          id: -2,
          action_id: actionId,
          card_id: null,
          col: 0,
          row: 0,
          size_x: 4,
          size_y: 1,
          series: [],
          // Map action's ID parameter to dashboard parameter
          parameter_mappings: [
            {
              parameter_id: ID_DASHBOARD_PARAMETER.id,
              target: [
                "variable",
                ["template-tag", ID_DASHBOARD_PARAMETER.slug],
              ],
            },
          ],
          visualization_settings: {
            actionDisplayType: "button",
            virtual_card: {
              name: null,
              display: "action",
              visualization_settings: {},
              dataset_query: {},
              archived: false,
            },
            "button.label": QUERY_ACTION.name,
          },
        },
      ],
    });
  });

  test("can submit query action linked with dashboard parameters (metabase#32974)", async ({
    mb,
    page,
  }) => {
    await visitDashboardWithParams(page, mb.api, dashboardId, { id: 1 });

    // Execute action
    await page
      .getByRole("button", { name: QUERY_ACTION.name, exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: QUERY_ACTION.name, exact: true })
      .click();

    // Assertions
    await expect(
      getDashboardCard(page, 0).getByText(String(EXPECTED_UPDATED_VALUE), {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(modal(page)).toHaveCount(0);
    await expect(
      undoToast(page).getByText("Query action ran successfully", {
        exact: true,
      }),
    ).toHaveCount(1);
  });
});

test.describe("issue 51020", () => {
  /**
   * Port of the file-level setupDashboard({ questionName, modelName, columnName }).
   */
  async function setupDashboard(
    page: Page,
    {
      questionName,
      modelName,
      columnName,
    }: { questionName: string; modelName: string; columnName: string },
  ) {
    await newButton(page).click();
    await popover(page).getByText("Dashboard", { exact: true }).click();

    const createModal = modal(page);
    const nameInput = createModal.getByLabel("Name", { exact: true });
    await nameInput.click();
    await nameInput.pressSequentially("Dash");
    await createModal.getByRole("button", { name: "Create", exact: true }).click();

    await page
      .getByRole("button", { name: "Add a chart", exact: true })
      .click();
    await page
      .getByTestId("add-card-sidebar")
      .getByText(questionName, { exact: true })
      .click();
    // Anchor: the dashcard-add is async and Playwright fires the next command
    // back-to-back (PORTING).
    await expect(page.getByTestId("dashcard-container")).toHaveCount(1);

    await page.getByLabel("Add a filter or parameter", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await getDashboardCard(page, 0)
      .getByText("Select…", { exact: true })
      .click();
    await popover(page).getByText(columnName, { exact: true }).first().click();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Click behavior: update the dashboard filter from the column.
    const card = getDashboardCard(page, 0);
    await card.hover();
    await icon(card, "click").click();

    const sidebar = aside(page);
    await sidebar.getByText(columnName, { exact: true }).click();
    await sidebar
      .getByText("Update a dashboard filter", { exact: true })
      .click();
    await sidebar.getByTestId("click-target-column").click();
    await selectDropdown(page).getByText(columnName, { exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Action card.
    await page.getByLabel("Add action", { exact: true }).click();
    await page
      .getByRole("button", { name: "Pick an action", exact: true })
      .click();
    const pickerModal = modal(page);
    await pickerModal.getByText(modelName, { exact: true }).click();
    await pickerModal.getByText("Update", { exact: true }).click();
    const askTheUser = await findByDisplayValue(pickerModal, "Ask the user");
    await askTheUser.click();
    await selectDropdown(page).getByText("ID", { exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);
  }

  /**
   * Port of the two identical test bodies. Upstream duplicates it verbatim in
   * both describes; kept as one function so the two tests stay byte-equivalent
   * to each other, exactly as upstream.
   */
  async function runClickBehaviourAndUrlChecks(page: Page) {
    // check when primary key parameter is populated with click behavior
    await getDashboardCard(page, 0)
      .getByText("1", { exact: true })
      .first()
      .click();
    await getDashboardCard(page, 1)
      .getByText("Click Me", { exact: true })
      .click();
    await appendToInput(
      modal(page).getByLabel("Name", { exact: true }),
      " Baz",
    );
    await modal(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();

    await expect(modal(page)).toHaveCount(0);
    await expect(
      undoToast(page).getByText("Successfully updated", { exact: true }),
    ).toBeVisible();
    await expect(getDashboardCard(page, 0)).toContainText("Foo Baz");

    // check when primary key parameter is populated with URL
    await page.reload();
    await getDashboardCard(page, 1)
      .getByText("Click Me", { exact: true })
      .click();
    await appendToInput(
      modal(page).getByLabel("Name", { exact: true }),
      " Baz",
    );
    await modal(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();

    await expect(modal(page)).toHaveCount(0);
    await expect(
      undoToast(page).getByText("Successfully updated", { exact: true }),
    ).toBeVisible();
    await expect(getDashboardCard(page, 0)).toContainText("Foo Baz Baz");
  }

  test.describe("when primary key is called 'id'", () => {
    // UNTAGGED upstream, but it restores postgres-writable and does DDL against
    // the shared writable container. The missing @external tag is an upstream
    // bug — gated regardless.
    skipUnlessQaDb();

    async function createTemporaryTable() {
      await queryWritableDB(
        "CREATE TABLE IF NOT EXISTS foo (id INT PRIMARY KEY, name VARCHAR)",
        "postgres",
      );
      await queryWritableDB(
        "INSERT INTO foo (id, name) VALUES (1, 'Foo'), (2, 'Bar')",
        "postgres",
      );
    }

    async function dropTemporaryTable() {
      await queryWritableDB(
        "ALTER TABLE IF EXISTS foo DROP CONSTRAINT foo_pkey",
        "postgres",
      );
      await queryWritableDB("DROP TABLE IF EXISTS foo", "postgres");
    }

    test.beforeEach(async ({ mb, page }) => {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await dropTemporaryTable();
      await createTemporaryTable();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: ["foo"] });

      const tableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "foo",
        // Schema pinned — see the port notes (PORTING #85).
        schema: "public",
      });
      const modelId = await createModelFromTable(mb.api, {
        tableId,
        modelName: "Model 51020",
      });
      // H.createQuestion(..., { visitQuestion: true }) routes MODELS to
      // visitModel, which runs POST /api/dataset (never /api/card/:id/query).
      const dataset = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.goto(`/model/${modelId}`);
      await dataset;

      await setupBasicActionsInModel(page);
      await setupDashboard(page, {
        modelName: "Model 51020",
        questionName: "Model 51020",
        columnName: "ID",
      });
    });

    test.afterEach(async () => {
      // Guarded on the gate, or a gate-OFF control reports FAILED instead of
      // SKIPPED (PORTING).
      if (!process.env.PW_QA_DB_ENABLED) {
        return;
      }
      await dropTemporaryTable();
    });

    test("should pass primary key attribute to execute action endpoint when primary key is called 'id' and it's populated with click behavior or URL (metabase#51020)", async ({
      page,
    }) => {
      await runClickBehaviourAndUrlChecks(page);
    });
  });

  test.describe("when primary key is not called 'id'", () => {
    // @external
    skipUnlessQaDb();

    async function createTemporaryTable() {
      await queryWritableDB(
        "CREATE TABLE IF NOT EXISTS foo (foo INT PRIMARY KEY, name VARCHAR)",
        "postgres",
      );
      await queryWritableDB(
        "INSERT INTO foo (foo, name) VALUES (1, 'Foo'), (2, 'Bar')",
        "postgres",
      );
    }

    async function dropTemporaryTable() {
      await queryWritableDB(
        "ALTER TABLE IF EXISTS foo DROP CONSTRAINT foo_pkey",
        "postgres",
      );
      await queryWritableDB("DROP TABLE IF EXISTS foo", "postgres");
    }

    test.beforeEach(async ({ mb, page }) => {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();

      await dropTemporaryTable();
      await createTemporaryTable();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: ["foo"] });

      await page.goto("/model/new");
      await page
        .getByTestId("new-model-options")
        .getByText("Use the notebook editor", { exact: true })
        .click();
      await miniPickerBrowseAll(page).click();

      const picker = entityPickerModal(page);
      /**
       * Without this wait, typing speed causes flakiness: fast typing switches
       * to search tab before picker content loads, so no folder is selected and
       * "Everywhere" toggle doesn't appear. (upstream's own comment)
       */
      await expect(picker.getByTestId("single-picker-view")).toBeVisible();
      await picker.getByRole("searchbox").pressSequentially("foo");
      await picker.getByText("Everywhere", { exact: true }).click();
      await picker.getByText("Foo", { exact: true }).click();

      const dataset = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.getByTestId("run-button").click();
      await dataset;

      const createCard = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );
      const getCard = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saveModal = modal(page);
      const nameInput = saveModal.getByLabel("Name", { exact: true });
      await nameInput.click();
      await nameInput.fill("");
      await nameInput.pressSequentially("Model 51020");
      await saveModal.getByRole("button", { name: "Save", exact: true }).click();
      await createCard;
      await getCard;

      await setupBasicActionsInModel(page);

      await newButton(page).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await entityPickerModalItem(page, 1, "Model 51020").click();
      await saveQuestion(page, "Question 51020", { path: ["Our analytics"] });

      await setupDashboard(page, {
        modelName: "Model 51020",
        questionName: "Question 51020",
        columnName: "Foo",
      });
    });

    test.afterEach(async () => {
      if (!process.env.PW_QA_DB_ENABLED) {
        return;
      }
      await dropTemporaryTable();
    });

    test("should pass primary key attribute to execute action endpoint when primary key isn't called 'id' and it's populated with click behavior or URL (metabase#51020)", async ({
      page,
    }) => {
      await runClickBehaviourAndUrlChecks(page);
    });
  });
});

test.describe("issue 32840", () => {
  let modelId: number;

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);

    const model = await mb.api.createQuestion({
      type: "model",
      name: "Products model",
      database: SAMPLE_DB_ID,
      query: { "source-table": PRODUCTS_ID },
    });
    modelId = model.id;

    await createAction(mb.api, {
      type: "implicit",
      kind: "row/update",
      name: "Update",
      model_id: modelId,
    });

    // H.visitModel: /model/:id runs POST /api/dataset.
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page.goto(`/model/${modelId}`);
    await dataset;
  });

  test("uses correct timestamp when executing implicit update action (metabase#32840)", async ({
    page,
  }) => {
    /**
     * The two timestamps below are data-derived from the sample database and
     * are pinned upstream — they were bumped wholesale by
     * `Update the Sample Database by shifting CREATED_AT by three years`
     * (c16ec07edc5, 2026-04-17), i.e. they track a checked-in artifact rather
     * than the current date. Ported verbatim; if CI's freshly-built jar ever
     * carries a re-generated sample DB these are the assertions that move.
     */
    const CREATED_AT_DISPLAY = "July 19, 2026, 7:44 PM";
    const CREATED_AT_INPUT = "2026-07-19T19:44:56";

    const executeAction = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /^\/api\/action\/[^/]+\/execute$/.test(new URL(response.url()).pathname),
    );

    await page.getByTestId("cell-data").nth(8).click();

    const detailModal = modal(page);
    await expect(
      detailModal.getByText(CREATED_AT_DISPLAY, { exact: true }),
    ).toBeVisible();
    await detailModal.getByTestId("actions-menu").click();

    const update = popover(page).getByText("Update", { exact: true });
    await expect(update).toBeVisible();
    await update.click();

    const updateModal = modal(page).nth(1);
    await expect(
      updateModal.getByPlaceholder("Created At", { exact: true }),
    ).toHaveValue(CREATED_AT_INPUT);
    const updateButton = updateModal.getByRole("button", {
      name: "Update",
      exact: true,
    });
    await updateButton.scrollIntoViewIfNeeded();
    await updateButton.click();

    await executeAction;
    await expect(
      modal(page).getByText(CREATED_AT_DISPLAY, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 32750", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
    await page.goto("/");
  });

  test("modal do not dissapear on viewport change", async ({ page }) => {
    await startNewAction(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.getByTestId("action-creator")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect(page.getByTestId("action-creator")).toBeVisible();
  });
});
