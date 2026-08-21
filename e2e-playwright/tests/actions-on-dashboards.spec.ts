/**
 * Playwright port of
 * e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js
 *
 * Port notes:
 * - The ENTIRE upstream spec is `@external` + `@actions`: every describe
 *   restores a `${dialect}-writable` snapshot and drives the writable QA
 *   database (postgres or mysql) via H.queryWritableDB / H.resetTestTable /
 *   H.resyncDatabase. None of that exists in the default Playwright CI setup,
 *   so every describe is gated on PW_QA_DB_ENABLED (PORTING.md rule 6 — the
 *   standard @external gate). With the gate off (the jar/slot verification
 *   default) all tests skip; there is no subset that can run without the
 *   writable DB, since even the WRK-67 modal test needs a model built from a
 *   writable table.
 * - cy.intercept(...).as() + cy.wait("@x") → waitForResponse predicates
 *   registered before the triggering action, awaited after (rule 2).
 * - H.moveDnDKitListElement's synthetic pointer sequence → real-mouse drag
 *   (support/actions-on-dashboards.ts) — dnd-kit's sensors accept it natively.
 * - The mysql leg needs the mysql writable container; queryWritableDB is
 *   dialect-aware but only runs behind the gate.
 * - clickHelper's cy.wait(100) (a pre-Cypress-v12 detached-element workaround)
 *   is dropped — Playwright re-resolves and waits for actionability per click.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";
import {
  addWidgetStringFilter,
  aside,
  createAction,
  createImplicitAction,
  createModelFromTableName,
  getActionCardDetails,
  MANY_DATA_TYPES_ROWS,
  moveDnDKitListElement,
  queryWritableDB,
  resetTestTable,
  type WritebackDialect,
} from "../support/actions-on-dashboards";
import {
  editDashboard,
  filterWidget,
  saveDashboard,
  selectDropdown,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { updateDashboardCards } from "../support/click-behavior";
import { dashboardParametersPopover } from "../support/dashboard-core";
import {
  openLegacyStaticEmbeddingModal,
  visitIframe,
} from "../support/embedding";
import { fieldValuesCombobox } from "../support/native-filters";
import { typeInNativeEditor } from "../support/native-editor";
import { clearNativeEditor } from "../support/native-extras";
import {
  WRITABLE_DB_ID,
  resyncDatabase,
} from "../support/schema-viewer";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { icon, modal, popover } from "../support/ui";
import { visitDashboard } from "../support/ui";

const TEST_TABLE = "scoreboard_actions";
const TEST_COLUMNS_TABLE = "many_data_types";
const MODEL_NAME = "Test Action Model";

const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA database (postgres/mysql) and its ${dialect}-writable snapshot (set PW_QA_DB_ENABLED)",
  );

// === intercept-alias predicates ===

const isGetModel = (r: Response) =>
  r.request().method() === "GET" &&
  /^\/api\/card\/\d+/.test(new URL(r.url()).pathname);

const isActionList = (r: Response) => {
  const url = new URL(r.url());
  return (
    r.request().method() === "GET" &&
    url.pathname === "/api/action" &&
    !url.searchParams.has("model-id")
  );
};

/**
 * Upstream's SECOND action intercept:
 *   cy.intercept("GET", "/api/action?model-id=*").as("getModelActions")
 * This is the request the model-detail page makes; `isActionList` above is
 * upstream's `@getActions` (bare "/api/action", which Cypress's glob does NOT
 * match against a query string). Waiting on `isActionList` at a
 * `/model/:id/detail` visit deadlocks — the page only ever fires the
 * `?model-id=` form.
 */
const isGetModelActions = (r: Response) => {
  const url = new URL(r.url());
  return (
    r.request().method() === "GET" &&
    url.pathname === "/api/action" &&
    url.searchParams.has("model-id")
  );
};

const isUpdateAction = (r: Response) =>
  r.request().method() === "PUT" &&
  /^\/api\/action\/.+/.test(new URL(r.url()).pathname);

const isPrefetch = (r: Response) => {
  const url = new URL(r.url());
  return (
    r.request().method() === "GET" &&
    /^\/api\/dashboard\/\d+\/dashcard\/\d+\/execute$/.test(url.pathname) &&
    url.searchParams.has("parameters")
  );
};

const isExecuteAction = (r: Response) =>
  r.request().method() === "POST" &&
  /^\/api\/dashboard\/\d+\/dashcard\/\d+\/execute$/.test(
    new URL(r.url()).pathname,
  );

// === spec-local UI helpers (ports of the file-level Cypress functions) ===

/** findAllByRole("dialog").filter(":visible") — the topmost open dialog. */
const visibleDialog = (page: Page): Locator =>
  page.locator('[role="dialog"]:visible').last();

const actionEditorModal = (page: Page): Locator =>
  page.getByTestId("action-editor-modal");

const getActionParametersInputModal = (page: Page): Locator =>
  page.getByTestId("action-parameters-input-modal");

/** cy.findByLabelText(label).closest("[data-testid=form-field-container]"). */
function formFieldContainer(scope: Locator, label: string): Locator {
  return scope
    .getByLabel(label, { exact: true })
    .locator('xpath=ancestor::*[@data-testid="form-field-container"][1]');
}

/**
 * Upstream's openFieldSettings() is always called INSIDE a
 * `formFieldContainer(...).within()`, so its `cy.icon("gear")` is scoped to
 * that one field. Taking a Page here made it page-wide and it hit four gears
 * (the action-level "Action settings" plus one per field) — hence the scope
 * argument.
 */
async function openFieldSettings(scope: Locator) {
  await icon(scope, "gear").click();
}

/**
 * The pencil in the action-parameters modal header does NOT respond to a real
 * Playwright mouse click: the click lands on the icon (hit-testing at the
 * element centre resolves to the icon itself — no overlay, no tooltip in the
 * way, verified with document.elementFromPoint) yet React's onClick never
 * fires and the editor modal stays closed. A synthetic click — which is what
 * Cypress's .click() dispatches — opens it immediately. Mechanism NOT
 * isolated; recorded as observed behaviour, not a diagnosis.
 */
async function openActionEditor(page: Page) {
  await icon(getActionParametersInputModal(page), "pencil").dispatchEvent(
    "click",
  );
  // NB: assert on the editor's CONTENT, not on the Mantine Modal root — the
  // root element reports `hidden` to Playwright even while the modal is open
  // and interactive.
  await expect(actionEditorModal(page).getByTestId("action-creator")).toBeVisible();
}

/**
 * Upstream: cy.findAllByText("Number").each(el => cy.wrap(el).click()) — set
 * every field's "Field type" radio to Number.
 *
 * Clicking them back to back does not stick: measured on this jar, field 0's
 * radio latches, and then clicking field 1's radio silently UNCHECKS field 0
 * again (isChecked() → false, still false a second later). The action was
 * therefore created with the `id` template tag still typed `text`, postgres
 * rejected the write with `operator does not exist: integer = character
 * varying`, and the read-back saw score 0 — i.e. the failure surfaced 200
 * lines away from its cause. Cypress's command queue paces the clicks enough
 * to avoid it; here we re-click until every radio is simultaneously checked.
 * The clobber mechanism itself is NOT diagnosed — recorded as observed.
 */
async function setAllFieldTypesToNumber(page: Page) {
  const radios = page
    .getByRole("dialog")
    .getByRole("radio", { name: "Number", exact: true });
  const count = await radios.count();
  expect(count).toBeGreaterThan(0);
  await expect(async () => {
    for (let index = 0; index < count; index++) {
      const radio = radios.nth(index);
      if (!(await radio.isChecked())) {
        await radio.click();
      }
    }
    for (let index = 0; index < count; index++) {
      await expect(radios.nth(index)).toBeChecked({ timeout: 1_000 });
    }
  }).toPass({ timeout: 30_000 });
}

/**
 * cy.task() hands its result back over the Cypress IPC bridge, which JSON
 * encodes it — a postgres `date`/`timestamp` column therefore reaches the
 * upstream spec as an ISO-8601 *string*, which is why upstream can write
 * `expect(row.date).to.include("2020-01-10")`. queryWritableDB talks to knex
 * directly and hands back the raw driver value (a JS Date), whose String()
 * form is "Fri Jan 10 2020 …" and contains no ISO date at all. Round-tripping
 * through JSON reproduces exactly what Cypress sees.
 *
 * This is used for the NON-temporal columns only. Its output is timezone
 * sensitive — a JS Date built from local wall-clock fields only serialises to
 * the same calendar day when the runner's zone is behind UTC — so the temporal
 * assertions read the `*_txt` columns below instead. See TEMPORAL_TEXT_COLUMNS.
 */
function asCypressRow(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

/**
 * Extra SELECT expressions that make the DATABASE render its own temporal
 * columns as text, aliased `<column>_txt`.
 *
 * Why: upstream asserts `expect(row.date).to.include("2020-05-01")` against
 * whatever the driver handed back, with the comment "metabase uses UTC
 * timestamps, so compare the date only" — i.e. it assumes the test runner sits
 * in UTC, which is true of CI and of nobody else. Both drivers actually return
 * a JS `Date`:
 *
 *   - for the tz-naive columns (`date`, `datetime`, `timestamp`) the Date is
 *     built from the stored wall clock interpreted in the RUNNER's zone, so its
 *     UTC serialisation rolls back a day on any zone ahead of UTC (measured
 *     here at UTC+13: `2020-02-01` came back as `2020-01-31T11:00:00.000Z`);
 *   - for the tz-aware columns (`datetimeTZ`, `timestampTZ`) postgres returns a
 *     genuine instant, whose calendar day likewise depends on which zone you
 *     render it in.
 *
 * Rendering server-side removes the runner from the picture entirely: the value
 * is formatted in the same database session zone it was written in, so the
 * comparison is against the wall clock the form actually submitted. That holds
 * on a UTC CI box and on a UTC+13 laptop alike.
 */
const TEMPORAL_TEXT_COLUMNS: Record<WritebackDialect, string> = {
  postgres: [
    `to_char("date", 'YYYY-MM-DD') AS "date_txt"`,
    `to_char("datetime", 'YYYY-MM-DD HH24:MI:SS') AS "datetime_txt"`,
    `to_char("datetimeTZ", 'YYYY-MM-DD HH24:MI:SS') AS "datetimeTZ_txt"`,
    `to_char("timestamp", 'YYYY-MM-DD HH24:MI:SS') AS "timestamp_txt"`,
    `to_char("timestampTZ", 'YYYY-MM-DD HH24:MI:SS') AS "timestampTZ_txt"`,
  ].join(", "),
  mysql: [
    "DATE_FORMAT(`date`, '%Y-%m-%d') AS `date_txt`",
    "DATE_FORMAT(`datetime`, '%Y-%m-%d %H:%i:%s') AS `datetime_txt`",
    "DATE_FORMAT(`datetimeTZ`, '%Y-%m-%d %H:%i:%s') AS `datetimeTZ_txt`",
    "DATE_FORMAT(`timestamp`, '%Y-%m-%d %H:%i:%s') AS `timestamp_txt`",
    "DATE_FORMAT(`timestampTZ`, '%Y-%m-%d %H:%i:%s') AS `timestampTZ_txt`",
  ].join(", "),
};

/**
 * The calendar date the database itself reports for a temporal column, as
 * `YYYY-MM-DD`.
 *
 * Upstream compares the date part only (its comment: "compare the date only"),
 * because the time-of-day of the tz-aware columns depends on how the app server
 * resolved the submitted wall clock. That is kept — but as an EXACT match on a
 * date rather than a substring match on a stringified timestamp, which is
 * strictly stronger: `toContain("2020-05-01")` also passes on
 * `2020-05-01T…` bleeding out of any other field of the serialised value.
 */
function dbDate(row: Record<string, unknown>, column: string): string {
  const value = row[`${column}_txt`];
  expect(
    typeof value,
    `${column}_txt rendered by the database (got ${JSON.stringify(value)})`,
  ).toBe("string");
  return String(value).slice(0, 10);
}

/** Port of the file-level toggleFieldVisibility: click "Show field". */
async function toggleFieldVisibility(container: Locator) {
  await container.getByText("Show field", { exact: true }).click();
}

/**
 * Port of cy.findAllByDisplayValue(regex): form controls whose *current* value
 * matches. Returns the first match (upstream's .first()).
 */
async function findByDisplayValueMatching(
  scope: Locator,
  re: RegExp,
): Promise<Locator> {
  const controls = scope.locator("input, textarea, select");
  await expect(controls.first()).toBeVisible();
  const count = await controls.count();
  for (let index = 0; index < count; index++) {
    if (re.test(await controls.nth(index).inputValue())) {
      return controls.nth(index);
    }
  }
  throw new Error(`No form control with display value matching ${re}`);
}

/**
 * Port of the spec-local clickHelper: the upstream cy.wait(100) worked around
 * detached elements before Cypress v12; Playwright re-resolves and waits for
 * actionability per click, so the sleep is dropped.
 */
async function clickHelper(page: Page, buttonName: string) {
  await page.getByRole("button", { name: buttonName }).click();
}

/** Port of changeValue: assert the input's type + current value, then retype. */
async function changeValue(
  page: Page,
  {
    fieldName,
    fieldType,
    oldValue,
    newValue,
  }: {
    fieldName: string;
    fieldType: string;
    oldValue: unknown;
    newValue: unknown;
  },
) {
  const input = page.getByPlaceholder(fieldName, { exact: true });
  await expect(input).toHaveAttribute("type", fieldType);
  await expect(input).toHaveValue(String(oldValue));
  await input.clear();
  await input.fill(String(newValue));
}

/**
 * Port of waitForValidActions: cy.wait("@getActions") asserting every action
 * carries at least one parameter. Register BEFORE the "Pick an action" click.
 */
async function pickAnActionAndValidate(page: Page) {
  const getActions = page.waitForResponse(isActionList);
  await aside(page).getByRole("button", { name: "Pick an action" }).click();
  const response = await getActions;
  const actions = (await response.json()) as { parameters: unknown[] }[];
  for (const action of actions) {
    expect(action.parameters.length).toBeGreaterThan(0);
  }
}

/**
 * Port of the file-level createDashboardWithActionButton. Returns the created
 * dashboard id (upstream wraps it as @dashboardId and reads it back later).
 */
async function createDashboardWithActionButton(
  page: Page,
  mb: { api: MetabaseApi },
  {
    actionName,
    modelName = MODEL_NAME,
    idFilter = false,
    hideField,
  }: {
    actionName: string;
    modelName?: string;
    idFilter?: boolean;
    hideField?: string;
  },
): Promise<number> {
  const { id: dashboardId } = await mb.api.createDashboard({
    name: "action packed dashboard",
  });
  await visitDashboard(page, mb.api, dashboardId);

  await editDashboard(page);

  if (idFilter) {
    await setFilter(page, "ID");
    await sidebar(page).getByRole("button", { name: "Done" }).click();
  }

  await page.getByRole("button", { name: "Add action" }).click();
  await aside(page).getByPlaceholder("Button text").fill(actionName);
  await pickAnActionAndValidate(page);

  await page.getByRole("dialog").getByText(modelName, { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText(actionName, { exact: true })
    .click();

  if (hideField) {
    const getModel = page.waitForResponse(isGetModel);
    await icon(page.getByRole("dialog"), "pencil").click();
    await getModel;

    const updated = page.waitForResponse(isUpdateAction);
    await toggleFieldVisibility(
      formFieldContainer(visibleDialog(page), hideField),
    );
    await visibleDialog(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await updated;

    await expect(page.getByTestId("action-creator")).toHaveCount(0);
  }

  if (idFilter) {
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/has no parameters to map/i)).toHaveCount(0);
    await expect(dialog.getByText(/Where should the values/i)).toBeVisible();
    const askTheUser = await findByDisplayValueMatching(dialog, /ask the user/i);
    await askTheUser.click();
    await selectDropdown(page).getByText("ID", { exact: true }).click();
  }

  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  await saveDashboard(page);

  return dashboardId;
}

// === Write Actions on Dashboards (mysql) / (postgres) ===

for (const dialect of ["mysql", "postgres"] as const satisfies readonly WritebackDialect[]) {
  test.describe(`Write Actions on Dashboards (${dialect})`, () => {
    skipUnlessQaDb();

    test.describe("adding and executing actions", () => {
      let modelId: number;

      test.beforeEach(async ({ page, mb }) => {
        await resetSnowplow(mb);
        await mb.restore(`${dialect}-writable`);
        await resetTestTable({ type: dialect, table: TEST_TABLE });
        await mb.signInAsAdmin();
        await enableTracking(mb);
        await resyncDatabase(mb.api, {
          dbId: WRITABLE_DB_ID,
          tables: [TEST_TABLE],
        });
        modelId = await createModelFromTableName(mb.api, {
          tableName: TEST_TABLE,
          modelName: MODEL_NAME,
        });
      });

      test.afterEach(async ({ mb }) => {
        await expectNoBadSnowplowEvents(mb);
      });

      test("action creation modal can be closed on click outside (WRK-67)", async ({
        page,
        mb,
      }) => {
        const getModel = page.waitForResponse(isGetModel);
        const getModelActions = page.waitForResponse(isGetModelActions);
        await page.goto(`/model/${modelId}/detail`);
        await getModel;
        await getModelActions;

        const newActionBtn = () =>
          page
            .getByTestId("model-actions-header")
            .getByText("New action", { exact: true });

        // click outside
        await newActionBtn().click();
        await expect(page.getByTestId("action-creator")).toBeVisible();
        await page.locator("body").click({ position: { x: 0, y: 0 } });
        await expect(page.getByTestId("action-creator")).toHaveCount(0);

        // ESC button
        await newActionBtn().click();
        await expect(page.getByTestId("action-creator")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("action-creator")).toHaveCount(0);
      });

      test("adds a custom query action to a dashboard and runs it", async ({
        page,
        mb,
      }) => {
        const ACTION_NAME = "Update Score";

        const before = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
          dialect,
        );
        expect(before.rows.length).toBe(1);
        expect(before.rows[0].score).toBe(0);

        const getModel = page.waitForResponse(isGetModel);
        const getModelActions = page.waitForResponse(isGetModelActions);
        await page.goto(`/model/${modelId}/detail`);
        await getModel;
        await getModelActions;

        await page
          .getByTestId("model-actions-header")
          .getByText("New action", { exact: true })
          .click();

        await typeInNativeEditor(
          page,
          `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }}`,
        );

        // can't be scoped to the dialog because it needs document.body
        await moveDnDKitListElement(page, "drag-handle", {
          startIndex: 1,
          dropIndex: 0,
        });

        await setAllFieldTypesToNumber(page);
        await page.getByRole("dialog").getByText("Save", { exact: true }).click();

        await page.getByPlaceholder("My new fantastic action").fill(ACTION_NAME);
        await page
          .getByTestId("create-action-form")
          .getByRole("button", { name: "Create" })
          .click();

        await createDashboardWithActionButton(page, mb, {
          actionName: ACTION_NAME,
          idFilter: true,
        });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "new_action_card_created",
        });

        await filterWidget(page).first().click();
        await addWidgetStringFilter(page, "1");

        await page.getByRole("button", { name: "Update Score" }).click();
        const execute = page.waitForResponse(isExecuteAction);
        await page.getByRole("dialog").getByLabel("New Score").fill("55");
        await page.getByRole("dialog").getByRole("button", { name: ACTION_NAME }).click();
        await execute;

        const after = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
          dialect,
        );
        expect(after.rows.length).toBe(1);
        expect(after.rows[0].score).toBe(55);
      });

      test("adds an implicit create action to a dashboard and runs it", async ({
        page,
        mb,
      }) => {
        await createImplicitAction(mb.api, { kind: "create", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Create",
        });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "new_action_card_created",
        });

        await page.getByRole("button", { name: "Create" }).click();

        const execute = page.waitForResponse(isExecuteAction);
        await modal(page).getByPlaceholder("Team Name").fill("Zany Zebras");
        await modal(page).getByPlaceholder("Score").fill("44");
        await modal(page).getByRole("button", { name: "Save" }).click();
        await execute;

        const result = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].score).toBe(44);
      });

      test("adds an implicit update action to a dashboard and runs it", async ({
        page,
        mb,
      }) => {
        const actionName = "Update";

        await createImplicitAction(mb.api, { kind: "update", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName,
          idFilter: true,
        });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "new_action_card_created",
        });

        // The prefetch GET is fired by APPLYING THE ID FILTER, not by clicking
        // the action button. ActionVizForm is mounted with the dashcard and its
        // prefetch effect re-runs as soon as `dashcardParamValues` becomes
        // non-empty (ActionVizForm.tsx: `canPrefetch = Object.keys(...)>0`);
        // clicking the button only does `setShowFormModal(true)` and issues no
        // request at all. Upstream gets away with waiting after the click
        // because `cy.intercept` is registered in beforeEach and `cy.wait`
        // matches retroactively — `page.waitForResponse` only matches responses
        // arriving after the call, so registering it after the filter loses a
        // ~20ms race against the backend and then blocks the full timeout.
        const prefetch = page.waitForResponse(isPrefetch);
        await filterWidget(page).first().click();
        await addWidgetStringFilter(page, "5");

        await page.getByRole("button", { name: actionName }).click();
        await prefetch;

        // existing values are pre-filled correctly
        const teamName = modal(page).getByPlaceholder("Team Name");
        await expect(teamName).toHaveValue("Energetic Elephants");
        await teamName.clear();
        await teamName.fill("Emotional Elephants");

        const score = modal(page).getByPlaceholder("Score");
        await expect(score).toHaveValue("30");
        await score.clear();
        await score.fill("88");

        const execute = page.waitForResponse(isExecuteAction);
        await modal(page).getByRole("button", { name: "Update" }).click();
        await execute;

        const result = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Emotional Elephants'`,
          dialect,
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].score).toBe(88);
      });

      test("adds an implicit delete action to a dashboard and runs it", async ({
        page,
        mb,
      }) => {
        const before = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        );
        expect(before.rows.length).toBe(1);
        expect(before.rows[0].id).toBe(3);

        await createImplicitAction(mb.api, { kind: "delete", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Delete",
        });

        await expectUnstructuredSnowplowEvent(mb, {
          event: "new_action_card_created",
        });

        await page.getByRole("button", { name: "Delete" }).click();

        const execute = page.waitForResponse(isExecuteAction);
        await modal(page).getByPlaceholder("ID").fill("3");
        await modal(page).getByRole("button", { name: "Delete" }).click();
        await execute;

        const after = await queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        );
        expect(after.rows.length).toBe(0);
      });

      test("hide actions in public dashboards (metabase#34395)", async ({
        page,
        mb,
      }) => {
        const dashboardName = "Public Dashboard";

        const action = await createImplicitAction(mb.api, {
          kind: "create",
          model_id: modelId,
        });
        const { id: dashboardId } = await mb.api.createDashboard({
          name: dashboardName,
        });
        await updateDashboardCards(mb.api, {
          dashboard_id: dashboardId,
          cards: [getActionCardDetails({ action_id: action.id, label: "Create" })],
        });
        await page.goto(`/dashboard/${dashboardId}`);

        // The action should be visible in the dashboard
        await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

        // Visit public dashboard
        const response = await mb.api.post(
          `/api/dashboard/${dashboardId}/public_link`,
          {},
        );
        const { uuid } = (await response.json()) as { uuid: string };
        await page.goto(`/public/dashboard/${uuid}`);

        // Assert public dashboard
        await expect(
          page.getByRole("heading", { name: dashboardName }),
        ).toBeVisible();
        // cy.button("Create") doesn't work because disabled actions are labeled
        // "Actions are not enabled for this database"
        await expect(
          page.getByRole("main").getByText("Create", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Powered by Metabase" }),
        ).toBeVisible();
      });

      test("hide actions in static embed dashboards (metabase#34395)", async ({
        page,
        mb,
      }) => {
        const dashboardName = "Public Dashboard";

        const action = await createImplicitAction(mb.api, {
          kind: "create",
          model_id: modelId,
        });
        const { id: dashboardId } = await mb.api.createDashboard({
          name: dashboardName,
        });
        // POST /api/dashboard ignores enable_embedding; upstream's
        // H.createDashboard applies it via a follow-up PUT (see the "create*
        // helpers are not thin wrappers" gotcha).
        await mb.api.put(`/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
        });
        await updateDashboardCards(mb.api, {
          dashboard_id: dashboardId,
          cards: [getActionCardDetails({ action_id: action.id, label: "Create" })],
        });
        await page.goto(`/dashboard/${dashboardId}`);

        // The action should be visible in the dashboard
        await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

        // Visit static embed dashboard
        await openLegacyStaticEmbeddingModal(page, mb.api, {
          resource: "dashboard",
          resourceId: dashboardId,
          activeTab: "parameters",
          unpublishBeforeOpen: false,
        });

        const { frame } = await visitIframe(page, mb);

        // Assert static embed dashboard
        await expect(
          frame.getByRole("heading", { name: dashboardName }),
        ).toBeVisible();
        await expect(
          frame.getByRole("main").getByText("Create", { exact: true }),
        ).toHaveCount(0);
        await expect(
          frame.getByRole("link", { name: "Powered by Metabase" }),
        ).toBeVisible();
      });

      test.describe("hidden fields", () => {
        test("adds an implicit action and runs it", async ({ page, mb }) => {
          await createImplicitAction(mb.api, {
            kind: "create",
            model_id: modelId,
          });

          await createDashboardWithActionButton(page, mb, {
            actionName: "Create",
            hideField: "Created At",
          });

          await page.getByRole("button", { name: "Create" }).click();

          const execute = page.waitForResponse(isExecuteAction);
          await modal(page).getByPlaceholder("Team Name").fill("Zany Zebras");
          await modal(page).getByPlaceholder("Score").fill("44");
          await expect(
            modal(page).getByPlaceholder("Created At"),
          ).toHaveCount(0);
          await modal(page).getByRole("button", { name: "Save" }).click();
          await execute;

          const result = await queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
            dialect,
          );
          expect(result.rows.length).toBe(1);
          expect(result.rows[0].score).toBe(44);
        });

        test("adds a query action and runs it", async ({ page, mb }) => {
          const ACTION_NAME = "Update Score";

          const before = await queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          );
          expect(before.rows.length).toBe(1);
          expect(before.rows[0].score).toBe(0);

          const getModel = page.waitForResponse(isGetModel);
          const getModelActions = page.waitForResponse(isGetModelActions);
          await page.goto(`/model/${modelId}/detail`);
          await getModel;
          await getModelActions;

          await page
            .getByTestId("model-actions-header")
            .getByText("New action", { exact: true })
            .click();

          await typeInNativeEditor(
            page,
            `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }} [[ and status = {{ current_status }}]]`,
          );

          await moveDnDKitListElement(page, "drag-handle", {
            startIndex: 1,
            dropIndex: 0,
          });

          await setAllFieldTypesToNumber(page);

          // hide optional field
          const currentStatus = formFieldContainer(
            page.getByRole("dialog"),
            "Current Status",
          );
          await currentStatus.getByText("Text", { exact: true }).click();
          await toggleFieldVisibility(currentStatus);
          await openFieldSettings(currentStatus);

          await popover(page)
            .getByLabel("Required")
            .uncheck({ force: true });

          await modal(page).getByText("Save", { exact: true }).click();

          await page
            .getByPlaceholder("My new fantastic action")
            .fill(ACTION_NAME);
          await page
            .getByTestId("create-action-form")
            .getByRole("button", { name: "Create" })
            .click();

          const dashboardId = await createDashboardWithActionButton(page, mb, {
            actionName: ACTION_NAME,
          });

          await page.getByRole("button", { name: "Update Score" }).click();

          const executeFirst = page.waitForResponse(isExecuteAction);
          await page.getByRole("dialog").getByLabel("ID").fill("1");
          await page.getByRole("dialog").getByLabel("New Score").fill("55");
          // it's hidden
          await expect(
            page.getByRole("dialog").getByLabel("Current Status"),
          ).toHaveCount(0);
          await page
            .getByRole("dialog")
            .getByRole("button", { name: ACTION_NAME })
            .click();
          await executeFirst;

          const mid = await queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          );
          expect(mid.rows.length).toBe(1);
          expect(mid.rows[0].score).toBe(55);

          const getModel2 = page.waitForResponse(isGetModel);
          const getModelActions2 = page.waitForResponse(isGetModelActions);
          await page.goto(`/model/${modelId}/detail`);
          await getModel2;
          await getModelActions2;

          await icon(
            page.locator("[aria-label='Update Score']"),
            "ellipsis",
          ).click();

          await popover(page).getByText("Edit", { exact: true }).click();

          const editStatus = formFieldContainer(
            page.getByRole("dialog"),
            "Current Status",
          );
          await toggleFieldVisibility(editStatus);
          await openFieldSettings(editStatus);

          await popover(page).getByLabel("Required").check({ force: true });

          const updated = page.waitForResponse(isUpdateAction);
          await modal(page).getByText("Update", { exact: true }).click();
          await updated;
          // The action editor closes after the update; wait until it is gone
          // before navigating to the dashboard.
          await expect(page.getByTestId("action-creator")).toHaveCount(0);

          await visitDashboard(page, mb.api, dashboardId);

          await page.getByRole("button", { name: "Update Score" }).click();

          const executeSecond = page.waitForResponse(isExecuteAction);
          await page.getByRole("dialog").getByLabel("ID").fill("1");
          await page.getByRole("dialog").getByLabel("New Score").fill("56");
          await page
            .getByRole("dialog")
            .getByLabel("Current Status")
            .fill("active");
          await page
            .getByRole("dialog")
            .getByRole("button", { name: ACTION_NAME })
            .click();
          await executeSecond;

          const final = await queryWritableDB(
            `SELECT * FROM ${TEST_TABLE} WHERE id = 1`,
            dialect,
          );
          expect(final.rows.length).toBe(1);
          expect(final.rows[0].score).toBe(56);
        });
      });
    });

    test.describe("Actions Data Types", () => {
      let modelId: number;

      test.beforeEach(async ({ mb }) => {
        await mb.restore(`${dialect}-writable`);
        await resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
        await mb.signInAsAdmin();
        await resyncDatabase(mb.api, {
          dbId: WRITABLE_DB_ID,
          tables: [TEST_COLUMNS_TABLE],
        });
        modelId = await createModelFromTableName(mb.api, {
          tableName: TEST_COLUMNS_TABLE,
          modelName: MODEL_NAME,
        });
      });

      test("can update various data types via implicit actions", async ({
        page,
        mb,
      }) => {
        await createImplicitAction(mb.api, { kind: "update", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Update",
          idFilter: true,
        });

        const getModel = page.waitForResponse(isGetModel);
        // (cy.wait("@getModel") — the dashcard's model fetch)
        // Registered before the filter is applied: that is what fires the
        // prefetch, not the button click. See the note in "adds an implicit
        // update action to a dashboard and runs it".
        const prefetch = page.waitForResponse(isPrefetch);
        await filterWidget(page).first().click();
        await addWidgetStringFilter(page, "1");

        await page.getByRole("button", { name: "Update" }).click();
        await getModel.catch(() => undefined);
        await prefetch;

        const oldRow = MANY_DATA_TYPES_ROWS[0];
        const dialog = modal(page).first();

        await changeValue(page, {
          fieldName: "UUID",
          fieldType: "text",
          oldValue: oldRow.uuid,
          newValue: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77",
        });
        await changeValue(page, {
          fieldName: "Integer",
          fieldType: "text",
          oldValue: oldRow.integer,
          newValue: 123,
        });
        await changeValue(page, {
          fieldName: "Float",
          fieldType: "text",
          oldValue: oldRow.float,
          newValue: 2.2,
        });

        const boolean = dialog.getByLabel("Boolean");
        await expect(boolean).toBeChecked();
        await boolean.click({ force: true });

        await changeValue(page, {
          fieldName: "String",
          fieldType: "text",
          oldValue: oldRow.string,
          newValue: "new string",
        });
        await changeValue(page, {
          fieldName: "Date",
          fieldType: "date",
          oldValue: oldRow.date,
          newValue: "2020-05-01",
        });

        // can't assert on this value because mysql and postgres handle
        // timezones differently
        // Upstream types "…T16:45:00"; Chrome normalises a zero-seconds
        // datetime-local back to "…T16:45", and Playwright's fill() then
        // rejects its own read-back as a "Malformed value". Same instant, and
        // the read-back below only asserts the date part. (Values with
        // non-zero seconds — e.g. the 01:35:55 test below — need no trim.)
        const timestampTZ = dialog.getByPlaceholder("TimestampTZ");
        await expect(timestampTZ).toHaveAttribute("type", "datetime-local");
        await timestampTZ.clear();
        await timestampTZ.fill("2020-05-01T16:45");

        const execute = page.waitForResponse(isExecuteAction);
        await dialog.getByRole("button", { name: "Update" }).click();
        await execute;

        const result = await queryWritableDB(
          `SELECT *, ${TEMPORAL_TEXT_COLUMNS[dialect]} FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
          dialect,
        );
        expect(result.rows.length).toBe(1);
        const row = asCypressRow(result.rows[0]);
        expect(row.uuid).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77");
        expect(row.integer).toBe(123);
        expect(row.float).toBe(2.2);
        expect(row.string).toBe("new string");
        expect(row.boolean).toBe(dialect === "mysql" ? 0 : false);
        expect(dbDate(row, "date")).toBe("2020-05-01");
        expect(dbDate(row, "timestampTZ")).toBe("2020-05-01");
      });

      test("can insert various data types via implicit actions", async ({
        page,
        mb,
      }) => {
        await createImplicitAction(mb.api, { kind: "create", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Create",
        });

        await page.getByRole("button", { name: "Create" }).click();

        const dialog = modal(page);
        await dialog
          .getByPlaceholder("UUID")
          .fill("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15");
        await dialog.getByPlaceholder("Integer", { exact: true }).fill("-20");
        await dialog.getByPlaceholder("IntegerUnsigned").fill("20");
        await dialog.getByPlaceholder("Tinyint", { exact: true }).fill("101");
        if (dialect === "mysql") {
          await dialog.getByLabel("Tinyint1").click({ force: true });
        } else {
          await dialog.getByPlaceholder("Tinyint1").fill("1");
        }
        await dialog.getByPlaceholder("Smallint").fill("32767");
        await dialog.getByPlaceholder("Mediumint").fill("8388607");
        await dialog.getByPlaceholder("Bigint").fill("922337204775");
        await dialog.getByPlaceholder("Float").fill("3.4");
        await dialog.getByPlaceholder("Double").fill("1.79769313486");
        await dialog.getByPlaceholder("Decimal").fill("123901.21");

        await dialog.getByLabel("Boolean").click({ force: true });

        await dialog.getByPlaceholder("String").fill("Zany Zebras");
        await dialog.getByPlaceholder("Text", { exact: true }).fill("Zany Zebras");

        await dialog.getByPlaceholder("Date", { exact: true }).fill("2020-02-01");
        // datetime-local values trimmed to minute precision — see above.
        await dialog
          .getByPlaceholder("Datetime", { exact: true })
          .fill("2020-03-01T12:00");
        await dialog
          .getByPlaceholder("DatetimeTZ")
          .fill("2020-03-01T12:00");
        await dialog.getByPlaceholder("Time", { exact: true }).fill("12:57:57");
        await dialog
          .getByPlaceholder("Timestamp", { exact: true })
          .fill("2020-03-01T12:00");
        await dialog
          .getByPlaceholder("TimestampTZ")
          .fill("2020-03-01T12:00");

        const execute = page.waitForResponse(isExecuteAction);
        await dialog.getByRole("button", { name: "Save" }).click();
        await execute;

        const result = await queryWritableDB(
          `SELECT *, ${TEMPORAL_TEXT_COLUMNS[dialect]} FROM ${TEST_COLUMNS_TABLE} WHERE string = 'Zany Zebras'`,
          dialect,
        );
        expect(result.rows.length).toBe(1);
        const row = asCypressRow(result.rows[0]);
        expect(row.uuid).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15");
        expect(row.integer).toBe(-20);
        expect(row.integerUnsigned).toBe(20);
        expect(row.tinyint).toBe(101);
        expect(row.tinyint1).toBe(1);
        expect(row.smallint).toBe(32767);
        expect(row.mediumint).toBe(8388607);
        expect(row.bigint).toBe(
          dialect === "mysql" ? 922337204775 : String(922337204775),
        );
        expect(row.float).toBe(3.4);
        expect(row.double).toBe(1.79769313486);
        expect(row.decimal).toBe("123901.21");
        expect(row.boolean).toBe(dialect === "mysql" ? 1 : true);
        expect(row.string).toBe("Zany Zebras");
        expect(row.text).toBe("Zany Zebras");
        expect(dbDate(row, "date")).toBe("2020-02-01");
        expect(dbDate(row, "datetime")).toBe("2020-03-01");
        expect(dbDate(row, "datetimeTZ")).toBe("2020-03-01");
        // `time` comes back from both drivers as a plain string ("12:57:57"),
        // never a Date, so it carries no timezone fragility.
        expect(String(row.time)).toContain("57:57");
        expect(dbDate(row, "timestamp")).toBe("2020-03-01");
        expect(dbDate(row, "timestampTZ")).toBe("2020-03-01");
      });

      test("does not show json, enum, or binary columns for implicit actions", async ({
        page,
        mb,
      }) => {
        await createImplicitAction(mb.api, { kind: "create", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Create",
          idFilter: true,
        });

        await page.getByRole("button", { name: "Create" }).click();

        const dialog = modal(page);
        await expect(dialog.getByPlaceholder("UUID")).toBeVisible();
        await expect(dialog.getByPlaceholder("JSON", { exact: true })).toHaveCount(0);
        await expect(dialog.getByPlaceholder("JSONB")).toHaveCount(0);
        await expect(dialog.getByPlaceholder("Binary")).toHaveCount(0);
        await expect(dialog.getByPlaceholder("Enum")).toHaveCount(1);
      });

      test("properly loads and updates date and time fields for implicit update actions", async ({
        page,
        mb,
      }) => {
        await createImplicitAction(mb.api, { kind: "update", model_id: modelId });

        await createDashboardWithActionButton(page, mb, {
          actionName: "Update",
          idFilter: true,
        });

        const getModel = page.waitForResponse(isGetModel);
        // Prefetch fires on filter apply, not on the button click — see the
        // note in "adds an implicit update action to a dashboard and runs it".
        const prefetch = page.waitForResponse(isPrefetch);
        await filterWidget(page).first().click();
        await addWidgetStringFilter(page, "1");

        await page.getByRole("button", { name: "Update" }).click();
        await getModel.catch(() => undefined);
        await prefetch;

        const oldRow = MANY_DATA_TYPES_ROWS[0];
        const newTime = "2020-01-10T01:35:55";
        const dialog = modal(page).first();

        await changeValue(page, {
          fieldName: "Date",
          fieldType: "date",
          oldValue: oldRow.date,
          newValue: newTime.slice(0, 10),
        });
        await changeValue(page, {
          fieldName: "Datetime",
          fieldType: "datetime-local",
          oldValue: oldRow.datetime.replace(" ", "T"),
          newValue: newTime,
        });
        await changeValue(page, {
          fieldName: "Time",
          fieldType: "time",
          oldValue: oldRow.time,
          newValue: newTime.slice(-8),
        });
        await changeValue(page, {
          fieldName: "Timestamp",
          fieldType: "datetime-local",
          oldValue: oldRow.timestamp.replace(" ", "T"),
          newValue: newTime,
        });
        await changeValue(page, {
          fieldName: "DatetimeTZ",
          fieldType: "datetime-local",
          oldValue: oldRow.datetimeTZ.replace(" ", "T"),
          newValue: newTime,
        });
        await changeValue(page, {
          fieldName: "TimestampTZ",
          fieldType: "datetime-local",
          oldValue: oldRow.timestampTZ.replace(" ", "T"),
          newValue: newTime,
        });

        const execute = page.waitForResponse(isExecuteAction);
        await dialog.getByRole("button", { name: "Update" }).click();
        await execute;

        const result = await queryWritableDB(
          `SELECT *, ${TEMPORAL_TEXT_COLUMNS[dialect]} FROM ${TEST_COLUMNS_TABLE} WHERE id = 1`,
          dialect,
        );
        const row = asCypressRow(result.rows[0]);
        const newTimeAdjusted = newTime.slice(0, 10);
        expect(dbDate(row, "date")).toBe(newTime.slice(0, 10));
        expect(row.time).toBe(newTime.slice(-8));
        expect(dbDate(row, "datetime")).toBe(newTimeAdjusted);
        expect(dbDate(row, "timestamp")).toBe(newTimeAdjusted);
        expect(dbDate(row, "datetimeTZ")).toBe(newTimeAdjusted);
        expect(dbDate(row, "timestampTZ")).toBe(newTimeAdjusted);
      });
    });

    test.describe("editing action before executing it", () => {
      const PG_DB_ID = 2;
      const WRITABLE_TEST_TABLE = "scoreboard_actions";

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

      const SAMPLE_QUERY_ACTION_NAME = "Demo Action";

      const sampleWritableQueryAction = () => ({
        name: SAMPLE_QUERY_ACTION_NAME,
        type: "query",
        parameters: [TEST_PARAMETER],
        database_id: PG_DB_ID,
        dataset_query: {
          type: "native",
          native: {
            query: `UPDATE ${WRITABLE_TEST_TABLE} SET score = 22 WHERE id = {{ ${TEST_TEMPLATE_TAG.name} }}`,
            "template-tags": {
              [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
            },
          },
          database: PG_DB_ID,
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
      });

      test.beforeEach(async ({ page, mb }) => {
        await mb.restore(`${dialect}-writable`);
        await resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
        await mb.signInAsAdmin();
        await resyncDatabase(mb.api, {
          dbId: WRITABLE_DB_ID,
          tables: [TEST_COLUMNS_TABLE],
        });
        const modelId = await createModelFromTableName(mb.api, {
          tableName: TEST_COLUMNS_TABLE,
          modelName: MODEL_NAME,
        });

        await createAction(mb.api, {
          ...sampleWritableQueryAction(),
          model_id: modelId,
        });

        await createDashboardWithActionButton(page, mb, {
          actionName: SAMPLE_QUERY_ACTION_NAME,
        });
      });

      test("allows to edit action title and field placeholder in action execute modal", async ({
        page,
      }) => {
        await clickHelper(page, SAMPLE_QUERY_ACTION_NAME);

        await openActionEditor(page);

        await actionEditorModal(page)
          .getByText(SAMPLE_QUERY_ACTION_NAME, { exact: true })
          .click();
        // clear + retype the action title
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("New action name");

        await icon(
          actionEditorModal(page).getByTestId("action-form-editor"),
          "gear",
        ).click();

        await popover(page)
          .getByText("Placeholder text", { exact: true })
          .click();
        await page.keyboard.type("Test placeholder");

        const updated = page.waitForResponse(isUpdateAction);
        await actionEditorModal(page)
          .getByRole("button", { name: "Update" })
          .click();
        await updated;
        await expect(actionEditorModal(page)).toHaveCount(0);

        await expect(
          getActionParametersInputModal(page)
            .getByTestId("modal-header")
            .getByText("New action name", { exact: true }),
        ).toBeVisible();
        await expect(
          getActionParametersInputModal(page).getByPlaceholder(
            "Test placeholder",
          ).first(),
        ).toBeVisible();
      });

      test("allows to edit action query and parameters in action execute modal", async ({
        page,
      }) => {
        await clickHelper(page, SAMPLE_QUERY_ACTION_NAME);

        await openActionEditor(page);

        await clearNativeEditor(page);
        const TEST_COLUMNS_QUERY = `UPDATE ${TEST_COLUMNS_TABLE} SET timestamp = {{ Timestamp }} WHERE id = {{ ID }}`;
        await typeInNativeEditor(page, TEST_COLUMNS_QUERY, { focus: false });

        const formEditor = actionEditorModal(page).getByTestId(
          "action-form-editor",
        );
        await formEditor
          .getByText("ID", { exact: true })
          .locator('xpath=ancestor::*[@data-testid="form-field-container"][1]')
          .getByRole("radiogroup", { name: "Field type" })
          .getByText("Number", { exact: true })
          .click();
        await formEditor
          .getByText("Timestamp", { exact: true })
          .locator('xpath=ancestor::*[@data-testid="form-field-container"][1]')
          .getByRole("radiogroup", { name: "Field type" })
          .getByText("Date", { exact: true })
          .click();

        const updated = page.waitForResponse(isUpdateAction);
        await actionEditorModal(page)
          .getByRole("button", { name: "Update" })
          .click();
        await updated;
        await expect(actionEditorModal(page)).toHaveCount(0);

        await getActionParametersInputModal(page)
          .getByLabel("Timestamp")
          .fill("2020-01-01");
        await getActionParametersInputModal(page).getByLabel("ID").fill("1");

        const execute = page.waitForResponse(isExecuteAction);
        await getActionParametersInputModal(page)
          .getByRole("button", { name: SAMPLE_QUERY_ACTION_NAME })
          .click();
        const interception = await execute;
        const body = interception.request().postDataJSON() as {
          parameters: Record<string, unknown>;
        };
        expect(Object.values(body.parameters).sort().join(",")).toBe(
          "1,2020-01-01",
        );

        await expect(
          page
            .getByTestId("toast-undo")
            .getByText(`${SAMPLE_QUERY_ACTION_NAME} ran successfully`, {
              exact: true,
            }),
        ).toBeVisible();
      });
    });
  });
}

// === action error handling ===

test.describe("action error handling", () => {
  skipUnlessQaDb();

  let modelId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: TEST_TABLE });
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TEST_TABLE],
    });
    modelId = await createModelFromTableName(mb.api, {
      tableName: TEST_TABLE,
      modelName: MODEL_NAME,
    });
  });

  test("should show detailed form errors for constraint violations when executing model actions", async ({
    page,
    mb,
  }) => {
    const actionName = "Update";

    await createImplicitAction(mb.api, { kind: "update", model_id: modelId });

    await createDashboardWithActionButton(page, mb, {
      actionName,
      idFilter: true,
    });

    const getModel = page.waitForResponse(isGetModel);
    // Prefetch fires on filter apply, not on the button click — see the note in
    // "adds an implicit update action to a dashboard and runs it".
    const prefetch = page.waitForResponse(isPrefetch);
    await filterWidget(page).first().click();
    await addWidgetStringFilter(page, "5");
    await page.getByRole("button", { name: actionName }).click();
    await getModel.catch(() => undefined);
    await prefetch;

    const dialog = modal(page).first();
    const teamName = dialog.getByLabel("Team Name");
    await teamName.clear();
    await teamName.fill("Kind Koalas");
    const execute = page.waitForResponse(isExecuteAction);
    await dialog.getByRole("button", { name: actionName }).click();
    await execute;

    await expect(dialog.getByLabel("Team Name")).toBeVisible();
    await expect(
      dialog.getByText("This Team_name value already exists.", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Team_name already exists.", { exact: true }),
    ).toBeVisible();
  });
});

// === Action Parameters Mapping ===

test.describe("Action Parameters Mapping", () => {
  skipUnlessQaDb();

  test.describe("Inline action edit", () => {
    let modelId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await resetTestTable({ type: "postgres", table: TEST_TABLE });
      await mb.signInAsAdmin();
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: [TEST_TABLE],
      });
      modelId = await createModelFromTableName(mb.api, {
        tableName: TEST_TABLE,
        modelName: MODEL_NAME,
      });
    });

    test("refetches form values when id changes (metabase#33084)", async ({
      page,
      mb,
    }) => {
      const actionName = "Update";

      await createImplicitAction(mb.api, { kind: "update", model_id: modelId });

      await createDashboardWithActionButton(page, mb, {
        actionName,
        idFilter: true,
      });

      // Prefetch fires on filter apply, not on the button click — see the note
      // in "adds an implicit update action to a dashboard and runs it".
      const prefetchFirst = page.waitForResponse(isPrefetch);
      await filterWidget(page).first().click();
      await addWidgetStringFilter(page, "5");
      await page.getByRole("button", { name: actionName }).click();
      await prefetchFirst;

      await expect(modal(page).getByPlaceholder("Team Name")).toHaveValue(
        "Energetic Elephants",
      );
      await expect(modal(page).getByPlaceholder("Score")).toHaveValue("30");
      await icon(modal(page), "close").click();

      // Same race: the id-change prefetch fires when "Update filter" applies
      // the new value, not on the action button click.
      const prefetchSecond = page.waitForResponse(isPrefetch);
      await filterWidget(page).first().click();
      const combobox = fieldValuesCombobox(dashboardParametersPopover(page));
      await combobox.click();
      await page.keyboard.press("Backspace");
      await page.keyboard.type("10");
      await page.getByRole("button", { name: "Update filter" }).click();
      await page.getByRole("button", { name: actionName }).click();
      await prefetchSecond;

      await expect(modal(page).getByPlaceholder("Team Name")).toHaveValue(
        "Jolly Jellyfish",
      );
      await expect(modal(page).getByPlaceholder("Score")).toHaveValue("60");
    });

    test("should reflect to updated action on mapping form", async ({
      page,
      mb,
    }) => {
      const ACTION_NAME = "Update Score";

      const getModel = page.waitForResponse(isGetModel);
      const getModelActions = page.waitForResponse(isGetModelActions);
      await page.goto(`/model/${modelId}/detail`);
      await getModel;
      await getModelActions;

      await page
        .getByTestId("model-actions-header")
        .getByText("New action", { exact: true })
        .click();

      await typeInNativeEditor(
        page,
        `UPDATE ${TEST_TABLE} SET score = {{ new_score }} WHERE id = {{ id }}`,
      );

      await page.getByRole("dialog").getByText("Save", { exact: true }).click();

      await page.getByPlaceholder("My new fantastic action").fill(ACTION_NAME);
      await page
        .getByTestId("create-action-form")
        .getByRole("button", { name: "Create" })
        .click();

      const { id: dashboardId } = await mb.api.createDashboard({
        name: "action packed dashboard",
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);

      await setFilter(page, "ID");
      await sidebar(page).getByRole("button", { name: "Done" }).click();

      await page.getByRole("button", { name: "Add action" }).click();
      await aside(page).getByPlaceholder("Button text").fill(ACTION_NAME);
      await pickAnActionAndValidate(page);

      await page.getByRole("dialog").getByText(MODEL_NAME, { exact: true }).click();
      await page.getByRole("dialog").getByText(ACTION_NAME, { exact: true }).click();

      await expect(
        page.getByRole("dialog").getByText("New Score: required", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("dialog").getByRole("button", { name: "Done" }),
      ).toBeEnabled();

      const getModel2 = page.waitForResponse(isGetModel);
      await icon(page.getByRole("dialog"), "pencil").click();
      await getModel2;

      await toggleFieldVisibility(
        formFieldContainer(visibleDialog(page), "New Score"),
      );
      const updated = page.waitForResponse(isUpdateAction);
      await visibleDialog(page)
        .getByRole("button", { name: "Update" })
        .click();
      await updated;

      // The action editor closes after the update; wait until only the
      // parameter mapping dialog remains.
      await expect(page.getByTestId("action-creator")).toHaveCount(0);

      await expect(
        page.getByRole("dialog").getByText("New Score: required", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog").getByRole("button", { name: "Done" }),
      ).toBeDisabled();
    });
  });
});
