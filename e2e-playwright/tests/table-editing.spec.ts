/**
 * Playwright port of
 * e2e/test/scenarios/table-editing/table-editing.cy.spec.ts
 *
 * Warning (carried from upstream): do not modify SAMPLE_DB data to test any
 * table-editing feature — it is shared by many tests.
 *
 * Port notes:
 * - The ENTIRE spec drives the writable QA postgres database: the top-level
 *   beforeEach restores the `postgres-writable` snapshot and resets a writable
 *   table via H.resetTestTable / H.queryWritableDB. None of that exists in the
 *   default (jar/slot) Playwright setup, so the whole describe is gated on
 *   PW_QA_DB_ENABLED (PORTING.md rule 6 — the standard writable-DB/@external
 *   gate). With the gate off every test skips; there is no jar-runnable subset
 *   (even the "table editing bugs" describe inherits the parent beforeEach's
 *   writable restore before touching the Sample DB). The port is faithful by
 *   construction and runs when the writable container + snapshot are enabled.
 * - Snowplow helpers → no-op stubs (rule 6): no snowplow-micro container here.
 * - cy.intercept(...).as() + cy.wait("@x") → waitForResponse predicates
 *   registered before the triggering action, awaited after (rule 2).
 * - resetTestTable / queryWritableDB reuse the actions-on-dashboards knex
 *   primitives; getTableId / resyncDatabase / WRITABLE_DB_ID reuse
 *   schema-viewer; updatePermissionsGraph reuses dashboard-repros — all
 *   imported read-only.
 * - Transient undo toasts → .first() (repeated-action / CI-parallelism
 *   strict-mode guard from the wave-13 findings).
 */
import dayjs from "dayjs";

import type { Page, Response } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  queryWritableDB,
  resetTestTable,
} from "../support/actions-on-dashboards";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  getTableId,
  menu,
  resyncDatabase,
} from "../support/schema-viewer";
import { tableInteractiveBody } from "../support/table-column-settings";
import {
  getFieldId,
  getTableEditIcon,
  openEditRowModal,
  openTableBrowser,
  openTableEdit,
  setTableEditingEnabledForDB,
} from "../support/table-editing";
import { undoToast } from "../support/metrics";
import { icon, modal, popover } from "../support/ui";

const { ORDERS_ID, PRODUCTS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

// USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id.
const ALL_USERS_GROUP = 1;

// DataPermissionValue values (frontend/src/metabase-types/api/permissions.ts).
const UNRESTRICTED = "unrestricted";
const QUERY_BUILDER_AND_NATIVE = "query-builder-and-native";

const EDITABLE_SOURCE_TABLE_NAME = "many_data_types";
const EDITABLE_SOURCE_TABLE_NAME_REGEX = new RegExp("Many Data Types", "i");
const INLINE_EDIT_TEST_TABLE_NAME = "editing_test";
const DEFAULT_FIELD = "UUID";

// === snowplow no-op stubs (rule 6 — no snowplow-micro container) ===
const resetSnowplow = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA postgres database + its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

// === intercept-alias predicates ===

const isGetTable = (r: Response) =>
  r.request().method() === "GET" &&
  /^\/api\/table\/\d+$/.test(new URL(r.url()).pathname);

const isDataset = (r: Response) =>
  r.request().method() === "POST" &&
  new URL(r.url()).pathname === "/api/dataset";

const isExecuteBulk = (r: Response) =>
  r.request().method() === "POST" &&
  new URL(r.url()).pathname === "/api/ee/action-v2/execute-bulk";

const isTableQueryMetadata = (tableId?: number) => (r: Response) => {
  const pathname = new URL(r.url()).pathname;
  return (
    r.request().method() === "GET" &&
    (tableId != null
      ? pathname === `/api/table/${tableId}/query_metadata`
      : /^\/api\/table\/\d+\/query_metadata$/.test(pathname))
  );
};

const isFieldSearch = (fieldId: number, value: string) => (r: Response) => {
  const url = new URL(r.url());
  return (
    r.request().method() === "GET" &&
    url.pathname === `/api/field/${fieldId}/search/${fieldId}` &&
    url.searchParams.get("value") === value &&
    url.searchParams.get("limit") === "20"
  );
};

/** cy.findByText(text).closest("[role=button]"). */
function closestRoleButton(page: Page, scope: string, text: string) {
  return page
    .getByTestId(scope)
    .getByText(text, { exact: true })
    .locator('xpath=ancestor-or-self::*[@role="button"][1]');
}

test.describe("scenarios > table-editing", () => {
  skipUnlessQaDb();

  test.beforeEach(async ({ mb }) => {
    await resetSnowplow();

    await mb.restore("postgres-writable");
    await resetTestTable({
      type: "postgres",
      table: EDITABLE_SOURCE_TABLE_NAME,
    });

    await mb.signInAsAdmin();
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": UNRESTRICTED,
          "create-queries": QUERY_BUILDER_AND_NATIVE,
        },
      },
    });

    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [EDITABLE_SOURCE_TABLE_NAME],
    });

    await mb.api.activateToken("pro-self-hosted");

    await setTableEditingEnabledForDB(mb.api, WRITABLE_DB_ID);

    // @getDatabases GET /api/database, @getTable GET /api/table/* are handled
    // inline via waitForResponse at their call sites (rule 2).
  });

  test("should show edit icon on table browser", async ({ page }) => {
    await openTableBrowser(page);
    await expect(
      await getTableEditIcon(page, EDITABLE_SOURCE_TABLE_NAME_REGEX),
    ).toBeVisible();
  });

  test("should not show edit icon on table browser if user is not admin", async ({
    page,
    mb,
  }) => {
    await mb.signInAsNormalUser();

    await openTableBrowser(page);
    await expect(
      page.getByTestId("browse-schemas").getByTestId("edit-table-icon"),
    ).toHaveCount(0);
  });

  test("should allow to open table data edit mode", async ({ page }) => {
    await openTableBrowser(page);

    const getTable = page.waitForResponse(isGetTable);
    await openTableEdit(page, EDITABLE_SOURCE_TABLE_NAME_REGEX);

    // The Cypress test looks the table id up here only to assert a snowplow
    // event (no-op stub).
    await expectUnstructuredSnowplowEvent({
      event: "edit_data_button_clicked",
      triggered_from: "table-browser",
    });

    await getTable;

    const root = page.getByTestId("edit-table-data-root");
    await expect(root).toBeVisible();
    await expect(
      root.getByText(EDITABLE_SOURCE_TABLE_NAME_REGEX),
    ).toBeVisible();
    await expect(
      root
        .getByTestId("head-crumbs-container")
        .getByText("Edit", { exact: true }),
    ).toBeVisible();
    await expect(root.getByTestId("table-root")).toBeVisible();

    await page
      .getByTestId("head-crumbs-container")
      .getByText(EDITABLE_SOURCE_TABLE_NAME_REGEX)
      .click();

    await expect(page.getByTestId("query-builder-root")).toBeVisible();
  });

  test.describe("db setting is disabled", () => {
    test("should not allow to open table data view by default", async ({
      page,
      mb,
    }) => {
      await setTableEditingEnabledForDB(mb.api, WRITABLE_DB_ID, false);
      await openTableBrowser(page);
      await expect(
        page.getByTestId("browse-schemas").getByTestId("edit-table-icon"),
      ).toHaveCount(0);
    });
  });

  test.describe("non-admin user", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsNormalUser();
    });

    test("should not allow to open table data view", async ({ page, mb }) => {
      const tableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: EDITABLE_SOURCE_TABLE_NAME,
      });
      await page.goto(
        `/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`,
      );
      await expect(
        page.getByTestId("edit-table-data-restricted"),
      ).toBeVisible();
    });
  });

  test.describe("table edit mode", () => {
    test.beforeEach(async ({ page, mb }) => {
      await resetSnowplow();

      await queryWritableDB(
        `CREATE TABLE IF NOT EXISTS ${INLINE_EDIT_TEST_TABLE_NAME} AS SELECT id, uuid, integer, tinyint, string, date, datetime, boolean FROM ${EDITABLE_SOURCE_TABLE_NAME}`,
        "postgres",
      );
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });

      const tableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: INLINE_EDIT_TEST_TABLE_NAME,
      });

      // Adjusting the "string" column type: it defaults to type/Category (only
      // 2 unique values in the test dataset), which renders a dropdown instead
      // of a plain input when editing.
      const fieldId = await getFieldId(mb.api, { tableId, name: "string" });
      await mb.api.put(`/api/field/${fieldId}`, { semantic_type: null });

      const getDataTable = page.waitForResponse(isTableQueryMetadata(tableId));
      await page.goto(
        `/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`,
      );
      await getDataTable;
    });

    test.afterEach(async () => {
      await queryWritableDB(
        `DROP TABLE IF EXISTS ${INLINE_EDIT_TEST_TABLE_NAME}`,
        "postgres",
      );
    });

    test("should allow to filter table data", async ({ page }) => {
      await page
        .getByTestId("edit-table-data-root")
        .getByText("Filter", { exact: true })
        .click();

      await popover(page).getByText("ID", { exact: true }).click();
      await popover(page).getByText("Is", { exact: true }).click();

      await menu(page).getByText("Not empty", { exact: true }).click();

      const applied = page.waitForResponse(isDataset);
      await popover(page).getByText("Apply filter", { exact: true }).click();
      await applied;

      await expect(page.getByTestId("filters-visibility-control")).toHaveText(
        "1",
      );

      // check that filter persists after page refresh
      const reloaded = page.waitForResponse(isDataset);
      await page.reload();
      await reloaded;

      await expect(page.getByTestId("filters-visibility-control")).toHaveText(
        "1",
      );

      const filtersPanel = page.getByTestId("qb-filters-panel");
      await expect(filtersPanel).toBeVisible();
      const cleared = page.waitForResponse(isDataset);
      await icon(filtersPanel, "close").first().click();
      await cleared;

      await expect(
        page.getByTestId("filters-visibility-control"),
      ).toHaveCount(0);
    });

    test("should allow to sort table data", async ({ page }) => {
      const header = page.getByTestId("table-header");
      await header.getByText(DEFAULT_FIELD, { exact: true }).click();

      await expect(header.getByTestId("header-sort-indicator")).toHaveCount(1);

      await expect(
        closestRoleButton(page, "table-header", DEFAULT_FIELD).getByLabel(
          "chevronup icon",
          { exact: true },
        ),
      ).toBeVisible();

      await header.getByText(DEFAULT_FIELD, { exact: true }).click();

      await expect(
        closestRoleButton(page, "table-header", DEFAULT_FIELD).getByLabel(
          "chevrondown icon",
          { exact: true },
        ),
      ).toBeVisible();

      // check that sorting persists after page refresh
      const reloaded = page.waitForResponse(isDataset);
      await page.reload();
      await reloaded;

      await expect(
        closestRoleButton(page, "table-header", DEFAULT_FIELD).getByLabel(
          "chevrondown icon",
          { exact: true },
        ),
      ).toBeVisible();

      await page
        .getByTestId("table-header")
        .getByText(DEFAULT_FIELD, { exact: true })
        .click();

      await expect(
        page.getByTestId("table-header").getByTestId("header-sort-indicator"),
      ).toHaveCount(0);
    });

    test("should allow to view row details", async ({ page }) => {
      const rowId = await openEditRowModal(page, 1);
      await expect(modal(page).getByTestId("ID-field-input")).toHaveText(rowId);
    });

    test("should allow to edit a row using a modal", async ({ page }) => {
      await openEditRowModal(page, 1);

      const integerInput = modal(page).getByTestId("Integer-field-input");
      await integerInput.click();
      await integerInput.fill("123");
      await integerInput.blur();

      const update = page.waitForResponse(isExecuteBulk);
      await modal(page).getByTestId("update-row-save-button").click();
      const response = await update;
      const body = (await response.json()) as {
        outputs: { op: string; row: { integer: number } }[];
      };
      expect(body.outputs[0].op).toBe("updated");
      expect(body.outputs[0].row.integer).toBe(123);

      await expect(modal(page)).toHaveCount(0);

      await expect(
        undoToast(page).getByText("Successfully updated", { exact: true }).first(),
      ).toBeVisible();

      await expectUnstructuredSnowplowEvent({
        event: "edit_data_record_modified",
        event_detail: "update",
        triggered_from: "modal",
        result: "success",
      });
    });

    test.describe("inline cell editing", () => {
      const cases = [
        {
          dataType: "integer",
          column: "integer",
          value: Math.floor(Math.random() * 10000),
        },
        {
          dataType: "tinyint",
          column: "tinyint",
          value: Math.floor(Math.random() * 256),
        },
        {
          dataType: "string",
          column: "string",
          value: "test",
        },
      ] as const;

      for (const { dataType, column, value } of cases) {
        test(`should allow to edit a cell with type ${dataType}`, async ({
          page,
        }) => {
          // Locate the table and the specific cell to edit — the second row.
          const targetCell = tableInteractiveBody(page)
            .locator(`[data-column-id='${column}']`)
            .nth(1);
          await targetCell.click();

          const input = targetCell.locator("input").first();
          await input.fill(String(value));

          const update = page.waitForResponse(isExecuteBulk);
          await input.blur();
          const response = await update;
          const body = (await response.json()) as {
            outputs: {
              op: string;
              row: Record<string, unknown>;
            }[];
          };
          expect(body.outputs[0].op).toBe("updated");
          expect(body.outputs[0].row[column]).toBe(value);

          await expectUnstructuredSnowplowEvent({
            event: "edit_data_record_modified",
            event_detail: "update",
            triggered_from: "inline",
            result: "success",
          });

          await expect(
            undoToast(page)
              .getByText("Successfully updated", { exact: true })
              .first(),
          ).toBeVisible();
        });
      }

      test("should allow to edit a cell with date type", async ({ page }) => {
        const targetCell = tableInteractiveBody(page)
          .locator("[data-column-id='date']")
          .nth(1);
        await targetCell.click();

        const day = Math.floor(Math.random() * 10) + 10; // 10-20

        const update = page.waitForResponse(isExecuteBulk);
        await popover(page)
          .getByRole("button", { name: `${day} February 2020` })
          .click();
        const response = await update;
        const body = (await response.json()) as {
          outputs: { row: { date: string } }[];
        };
        const targetDate = dayjs(new Date(2020, 1, day)).format("YYYY-MM-DD");
        const responseDate = dayjs(body.outputs[0].row.date).format(
          "YYYY-MM-DD",
        );
        expect(responseDate).toBe(targetDate);

        await expect(
          undoToast(page)
            .getByText("Successfully updated", { exact: true })
            .first(),
        ).toBeVisible();
      });

      test("should allow to edit a cell with datetime type", async ({
        page,
      }) => {
        const targetCell = tableInteractiveBody(page)
          .getByTestId("center-center-quadrant")
          .getByRole("row")
          .nth(1)
          .locator("[data-column-id='datetime']");
        await targetCell.click();

        const day = 15;
        const hour = 11;
        const minute = 35;

        await popover(page)
          .getByRole("button", { name: `${day} February 2020` })
          .click();
        await popover(page).getByRole("spinbutton").nth(0).fill(hour.toString());
        await popover(page)
          .getByRole("spinbutton")
          .nth(1)
          .fill(minute.toString());
        await popover(page)
          .locator('select[data-am-pm="true"]')
          .selectOption("AM");

        // It's safe to click the last button because we're in the popover.
        const update = page.waitForResponse(isExecuteBulk);
        await popover(page).getByRole("button").last().click();
        const response = await update;
        const body = (await response.json()) as {
          outputs: { row: { datetime: string } }[];
        };
        const requestBody = response.request().postDataJSON() as {
          params: { datetime: string };
        };
        const targetDate = "2020-02-15T11:35:00";
        const requestDate = requestBody.params.datetime;
        const responseDate = body.outputs[0].row.datetime;

        // FE should preserve the initial input date's timezone offset.
        expect(requestDate).toBe(responseDate);
        // date param matches the input date (ignoring the tz offset at char 19)
        expect(requestDate.slice(0, 19)).toBe(targetDate);

        await expect(
          undoToast(page)
            .getByText("Successfully updated", { exact: true })
            .first(),
        ).toBeVisible();
      });

      test("should allow to edit a cell with select type", async ({ page }) => {
        const targetCell = tableInteractiveBody(page)
          .locator("[data-column-id='boolean']")
          .nth(1);
        await targetCell.click();

        // 3 options: true, false, null
        const options = popover(page).getByRole("option");
        await expect(options).toHaveCount(3);

        const update = page.waitForResponse(isExecuteBulk);
        await options.nth(0).click();
        const response = await update;
        const body = (await response.json()) as {
          outputs: { op: string }[];
        };
        expect(body.outputs[0].op).toBe("updated");

        await expect(
          undoToast(page)
            .getByText("Successfully updated", { exact: true })
            .first(),
        ).toBeVisible();
      });

      test("should not allow to edit PK cells", async ({ page }) => {
        const targetCell = tableInteractiveBody(page)
          .locator("[data-column-id='id']")
          .nth(1);
        await targetCell.click();
        await expect(targetCell.locator("input")).toHaveCount(0);
      });

      test("should handle errors", async ({ page }) => {
        const targetCell = tableInteractiveBody(page)
          .locator("[data-column-id='tinyint']")
          .nth(1);
        await targetCell.click();

        const input = targetCell.locator("input");
        // Entering a big number into a tinyint column
        await input.fill("9999999");
        await input.blur();

        await expect(
          undoToast(page)
            .getByText("Couldn't save table changes", { exact: true })
            .first(),
        ).toBeVisible();
      });
    });
  });

  test.describe("create / delete row", () => {
    test.beforeEach(async ({ page, mb }) => {
      await resetSnowplow();

      await mb.restore("postgres-writable");
      await resetTestTable({ type: "postgres", table: "scoreboard_actions" });
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["scoreboard_actions"],
      });

      await mb.api.activateToken("pro-self-hosted");
      await setTableEditingEnabledForDB(mb.api, WRITABLE_DB_ID);

      const tableId = await getTableId(mb.api, { name: "scoreboard_actions" });
      const getTableMetadata = page.waitForResponse(isTableQueryMetadata());
      await page.goto(
        `/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`,
      );
      await getTableMetadata;
    });

    test("should allow to create a row", async ({ page }) => {
      await page.getByTestId("new-record-button").click();

      await expect(
        modal(page).getByText("Create a new record", { exact: true }),
      ).toBeVisible();

      await page.getByTestId("Team Name-field-input").click();
      await popover(page)
        .getByRole("textbox")
        .pressSequentially("New York Bricks");
      await popover(page).getByText(/Add option/).click();

      await page.getByTestId("Score-field-input").fill("987");
      await page.getByTestId("Status-field-input").click();
      await popover(page).getByText("active", { exact: true }).click();

      const execute = page.waitForResponse(isExecuteBulk);
      await page.getByTestId("create-row-form-submit-button").click();
      const response = await execute;
      const body = (await response.json()) as {
        outputs: {
          op: string;
          row: { score: number; status: string; team_name: string };
        }[];
      };
      const request = response.request().postDataJSON() as { action: string };
      expect(request.action).toBe("data-grid.row/create");
      expect(body.outputs[0].op).toBe("created");
      expect(body.outputs[0].row.score).toBe(987);
      expect(body.outputs[0].row.status).toBe("active");
      expect(body.outputs[0].row.team_name).toBe("New York Bricks");

      await expect(
        undoToast(page)
          .getByText("Record successfully created", { exact: true })
          .first(),
      ).toBeVisible();
      await undoToast(page).getByLabel("close icon", { exact: true }).click();

      const tableRoot = page.getByTestId("table-root");
      await expect(
        tableRoot.getByText("New York Bricks", { exact: true }),
      ).toBeVisible();
      await expect(tableRoot.getByText("987", { exact: true })).toBeVisible();

      await expectUnstructuredSnowplowEvent({
        event: "edit_data_record_modified",
        event_detail: "create",
        triggered_from: "modal",
        result: "success",
      });
    });

    test("should allow to delete multiple rows (bulk)", async ({ page }) => {
      await page.getByTestId("row-select-checkbox").nth(1).click();
      await page.getByTestId("row-select-checkbox").nth(2).click();

      // should not show edit icon when rows are selected
      await expect(page.getByTestId("row-edit-icon")).toHaveCount(0);

      // should bulk delete rows
      await page
        .getByTestId("toast-card")
        .getByText("Delete", { exact: true })
        .click();

      await expect(
        modal(page).getByText("Delete 2 records?", { exact: true }),
      ).toBeVisible();
      const execute = page.waitForResponse(isExecuteBulk);
      await modal(page)
        .getByRole("button", { name: "Delete 2 records", exact: true })
        .click();
      const response = await execute;
      const body = (await response.json()) as { outputs: { op: string }[] };
      const request = response.request().postDataJSON() as { action: string };
      expect(request.action).toBe("data-grid.row/delete");
      expect(body.outputs[0].op).toBe("deleted");

      await expect(page.getByTestId("toast-card")).toHaveCount(0);

      await expect(
        undoToast(page)
          .getByText("Successfully deleted", { exact: true })
          .first(),
      ).toBeVisible();

      // should show edit icon when no rows are selected
      await expect(page.getByTestId("row-edit-icon").first()).toBeAttached();
    });
  });

  test.describe("table editing bugs", () => {
    test("WRK-907: should not allow to create new values for FK fields", async ({
      page,
      mb,
    }) => {
      await setTableEditingEnabledForDB(mb.api, SAMPLE_DB_ID);
      const NON_EXISTING_ID = "999999";

      const getDataTable = page.waitForResponse(
        isTableQueryMetadata(ORDERS_ID),
      );
      await page.goto(
        `/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`,
      );
      await getDataTable;

      await page.getByTestId("new-record-button").click();

      const getFieldValues = page.waitForResponse(
        isFieldSearch(ORDERS.USER_ID, NON_EXISTING_ID),
      );
      await modal(page).getByTestId("User ID-field-input").click();
      await page.keyboard.type(NON_EXISTING_ID);
      await getFieldValues;

      await expect(
        popover(page).getByText("Nothing found", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText(`Add option: ${NON_EXISTING_ID}`, {
          exact: true,
        }),
      ).toHaveCount(0);

      await modal(page).getByText("Cancel", { exact: true }).click();

      const getProductsTable = page.waitForResponse(
        isTableQueryMetadata(PRODUCTS_ID),
      );
      // navigate via breadcrumbs to avoid an expensive full page load
      await page
        .getByTestId("head-crumbs-container")
        .getByText("Sample Database", { exact: true })
        .click();
      await openTableEdit(page, new RegExp("Products", "i"));
      await getProductsTable;

      await page.getByTestId("new-record-button").click();

      await modal(page).getByTestId("Category-field-input").click();
      await page.keyboard.type(NON_EXISTING_ID);

      await expect(
        popover(page).getByRole("option", {
          name: `Add option: ${NON_EXISTING_ID}`,
        }),
      ).toBeVisible();
    });

    test("should allow creating a record in a table with a required date column (metabase#70647)", async ({
      page,
      mb,
    }) => {
      const TABLE_NAME = "date_create_test";

      await queryWritableDB(
        `DROP TABLE IF EXISTS ${TABLE_NAME}`,
        "postgres",
      );
      await queryWritableDB(
        `CREATE TABLE ${TABLE_NAME} (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          sale_date DATE NOT NULL
        )`,
        "postgres",
      );
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });

      const tableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: TABLE_NAME,
      });
      const getTableMetadata = page.waitForResponse(isTableQueryMetadata());
      await page.goto(
        `/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`,
      );
      await getTableMetadata;

      await page.getByTestId("new-record-button").click();
      await expect(
        modal(page).getByText("Create a new record", { exact: true }),
      ).toBeVisible();

      // The DATE column is NOT NULL, so the form stays invalid until a date is
      // picked. Before the fix, picking a date never reached the form state, so
      // the submit button stayed disabled and the row could not be created.
      await expect(page.getByTestId("Sale Date-field-input")).toBeVisible();
      await expect(
        page.getByTestId("create-row-form-submit-button"),
      ).toBeDisabled();

      const targetDay = dayjs().date(15);
      await page.getByTestId("Sale Date-field-input").click();
      await popover(page)
        .getByRole("button", { name: targetDay.format("D MMMM YYYY") })
        .click();

      const submit = page.getByTestId("create-row-form-submit-button");
      await expect(submit).toBeEnabled();
      const execute = page.waitForResponse(isExecuteBulk);
      await submit.click();
      const response = await execute;
      const body = (await response.json()) as {
        outputs: { op: string; row: { sale_date: string } }[];
      };
      const request = response.request().postDataJSON() as { action: string };
      expect(request.action).toBe("data-grid.row/create");
      expect(body.outputs[0].op).toBe("created");
      const responseDate = dayjs(body.outputs[0].row.sale_date).format(
        "YYYY-MM-DD",
      );
      expect(responseDate).toBe(targetDay.format("YYYY-MM-DD"));

      await expect(
        undoToast(page)
          .getByText("Record successfully created", { exact: true })
          .first(),
      ).toBeVisible();

      await queryWritableDB(
        `DROP TABLE IF EXISTS ${TABLE_NAME}`,
        "postgres",
      );
    });
  });
});
