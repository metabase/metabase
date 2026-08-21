/**
 * Helpers for the dashboard-filters-boolean spec port
 * (e2e/test/scenarios/dashboard-filters/dashboard-filters-boolean.cy.spec.ts).
 *
 * Parallel-agent rule: new helpers live here; nothing shared is edited.
 * Everything else the spec needs comes from existing modules — dashboard.ts,
 * dashboard-cards.ts, factories.ts, notebook.ts, detail-view.ts,
 * native-extras.ts, native-filters-extras.ts, filters-repros-2.ts,
 * schema-viewer.ts, table-editing.ts and ui.ts.
 *
 * These are ports of the spec-local factories/flows only; the shared `H`
 * helpers they call already have canonical ports.
 *
 * CONSOLIDATION NOTE: `createAndMapParameter` is the third spec-local copy of
 * "setFilter + selectDashboardFilter + Done" (see dashboard-filters-reproductions-2
 * and temporal-unit-parameters); worth folding into dashboard.ts next pass.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { dashboardParametersDoneButton } from "./filters-repros-2";
import {
  createNativeQuestionAndDashboard,
  createQuestionAndDashboard as createQuestionAndDashboardApi,
} from "./factories";
import { expect } from "./fixtures";
import {
  editDashboard,
  getDashboardCard,
  filterWidget,
  saveDashboard,
  selectDashboardFilter,
  selectDropdown,
  setFilter,
  sidebar,
} from "./dashboard";
import { showDashboardCardActions } from "./dashboard-cards";
import { entityPickerModal } from "./notebook";
import { SAMPLE_DATABASE } from "./sample-data";
import { WRITABLE_DB_ID, getTableId } from "./schema-viewer";
import { getFieldId } from "./table-editing";
import { icon, popover, visitDashboard } from "./ui";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

export const DIALECT = "postgres";
export const TABLE_NAME = "many_data_types";
export const QUESTION_NAME = "Test question";
export const QUESTION_2_NAME = "Test question 2";
export const DASHBOARD_NAME = "Test dashboard";
export const DASHBOARD_2_NAME = "Test dashboard 2";
export const PARAMETER_NAME = "Boolean parameter";
export const COLUMN_NAME = "Boolean";
export const FIELD_NAME = "boolean";

/**
 * Port of the spec-local createQuestionAndDashboard(): an MBQL question over
 * the SAMPLE database's PRODUCTS with a boolean custom expression
 * (`[ID] = 1`), so exactly one of the 200 rows is `true`.
 */
export async function createQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionName = QUESTION_NAME,
    dashboardName = DASHBOARD_NAME,
  }: { questionName?: string; dashboardName?: string } = {},
): Promise<{ dashboardId: number; questionId: number }> {
  const result = await createQuestionAndDashboardApi(api, {
    questionDetails: {
      name: questionName,
      query: {
        fields: [
          ["field", PRODUCTS.ID, null],
          ["expression", COLUMN_NAME],
        ],
        "source-table": PRODUCTS_ID,
        expressions: {
          [COLUMN_NAME]: ["=", ["field", PRODUCTS.ID, null], 1],
        },
      },
    },
    dashboardDetails: { name: dashboardName },
  });
  return { dashboardId: result.dashboardId, questionId: result.questionId };
}

/**
 * Port of the spec-local createNativeQuestionWithFieldFilterAndDashboard():
 * a SQL question over the WRITABLE postgres `many_data_types` table whose
 * `{{boolean}}` template tag is a `boolean/=` field filter on `boolean`.
 *
 * NEVER guess the field name — it is resolved through the API exactly like
 * upstream (H.getTableId → H.getFieldId), against WRITABLE_DB_ID. Under the
 * `postgres-writable` snapshot database 2 genuinely IS the writable container.
 */
export async function createNativeQuestionWithFieldFilterAndDashboard(
  api: MetabaseApi,
  {
    questionName = QUESTION_NAME,
    dashboardName = DASHBOARD_NAME,
  }: { questionName?: string; dashboardName?: string } = {},
): Promise<{ dashboardId: number; questionId: number }> {
  const tableId = await getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: TABLE_NAME,
  });
  const fieldId = await getFieldId(api, { tableId, name: FIELD_NAME });

  const result = await createNativeQuestionAndDashboard(api, {
    questionDetails: {
      name: questionName,
      database: WRITABLE_DB_ID,
      native: {
        query: `select id, boolean from ${TABLE_NAME} where {{boolean}}`,
        "template-tags": {
          boolean: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "boolean",
            "display-name": "Boolean",
            type: "dimension",
            dimension: ["field", fieldId, null],
            "widget-type": "boolean/=",
            default: null,
          },
        },
      },
    },
    dashboardDetails: { name: dashboardName },
  });
  return { dashboardId: result.dashboardId, questionId: result.questionId };
}

/**
 * Port of the spec-local createNativeQuestionWithVariableAndDashboard(): a SQL
 * question over the SAMPLE database whose `{{boolean}}` template tag is a plain
 * boolean VARIABLE (not a field filter), switching `products.category` between
 * Gadget (53 rows) and Widget (54 rows).
 */
export async function createNativeQuestionWithVariableAndDashboard(
  api: MetabaseApi,
): Promise<{ dashboardId: number; dashcardId: number; questionId: number }> {
  const result = await createNativeQuestionAndDashboard(api, {
    questionDetails: {
      name: QUESTION_NAME,
      native: {
        query:
          "select id from products [[where category = (case when {{boolean}} then 'Gadget' else 'Widget' end)]]",
        "template-tags": {
          boolean: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "boolean",
            "display-name": "Boolean",
            type: "boolean",
            default: null,
          },
        },
      },
    },
    dashboardDetails: { name: DASHBOARD_NAME },
  });
  return {
    dashboardId: result.dashboardId,
    dashcardId: result.id,
    questionId: result.questionId,
  };
}

/**
 * Port of the spec-local createAndMapParameter(): add a Boolean dashboard
 * parameter, wire it to `columnName` on the first dashcard, click Done.
 *
 * The `expect(...).toHaveCount(0)` after Done is a SEQUENCING ANCHOR, not a new
 * assertion: Playwright fires the following saveDashboard() click back-to-back
 * with this one, and saving before the sidebar has committed leaves the
 * dashboard un-dirty so the PUT never fires (PORTING.md "Anchor saveDashboard()
 * on the change it saves"). Noted as a deliberate addition.
 */
export async function createAndMapParameter(
  page: Page,
  {
    columnName = COLUMN_NAME,
    parameterName = PARAMETER_NAME,
  }: { columnName?: string; parameterName?: string } = {},
) {
  await setFilter(page, "Boolean", undefined, parameterName);
  await selectDashboardFilter(getDashboardCard(page), columnName);
  await dashboardParametersDoneButton(page).click();
  await expect(page.getByTestId("dashboard-parameter-sidebar")).toHaveCount(0);
}

/**
 * Port of the spec-local setupDashboardClickBehavior(): build the destination
 * dashboard (DASHBOARD_NAME), then a second dashboard (DASHBOARD_2_NAME) whose
 * card has a "Go to a custom destination → Dashboard" click behavior mapping
 * the boolean column onto `targetName` on the destination dashboard.
 */
export async function setupDashboardClickBehavior(
  page: Page,
  api: MetabaseApi,
  { targetName }: { targetName: string },
) {
  // setup target dashboard
  const target = await createQuestionAndDashboard(api, {
    dashboardName: DASHBOARD_NAME,
    questionName: QUESTION_NAME,
  });
  await visitDashboard(page, api, target.dashboardId);
  await editDashboard(page);
  await createAndMapParameter(page);
  await saveDashboard(page);

  // set up click behavior
  const source = await createQuestionAndDashboard(api, {
    dashboardName: DASHBOARD_2_NAME,
    questionName: QUESTION_2_NAME,
  });
  await visitDashboard(page, api, source.dashboardId);
  await editDashboard(page);
  await createAndMapParameter(page);
  await showDashboardCardActions(page);
  await page.getByLabel("Click behavior").click();
  await sidebar(page).getByText(COLUMN_NAME, { exact: true }).click();
  await sidebar(page)
    .getByText("Go to a custom destination", { exact: true })
    .click();
  await sidebar(page).getByText("Dashboard", { exact: true }).click();
  await entityPickerModal(page)
    .getByText(DASHBOARD_NAME, { exact: true })
    .click();
  await sidebar(page).getByText(PARAMETER_NAME, { exact: true }).click();
  await selectDropdown(page).getByText(targetName, { exact: true }).click();
  await saveDashboard(page);
}

/** The dashcard's row-count footer text (data-grid Footer's `rowsCount` span,
 * whose textContent is exactly "N row"/"N rows"). */
function rowCount(page: Page, text: string): Locator {
  return getDashboardCard(page).getByText(text, { exact: true });
}

/**
 * Port of the spec-local testParameterWidget().
 *
 * ⚠️ ASSERTION SEMANTICS — this helper's only signal is the dashcard ROW COUNT.
 * Where `trueRowCountText === falseRowCountText` (the native field-filter case:
 * 1 row either way) the true/false assertions are literally the same string, so
 * this helper CANNOT distinguish the two filter values there. Kept verbatim —
 * see findings-inbox/dashboard-filters-boolean.md.
 *
 * The BooleanWidget's picker defaults to "true" (BooleanWidget.tsx
 * getPickerValue's `.otherwise(() => "true")`), which is why the first
 * "Add filter" with no radio click applies True.
 */
export async function testParameterWidget(
  page: Page,
  {
    allRowCountText,
    trueRowCountText,
    falseRowCountText,
  }: {
    allRowCountText: string;
    trueRowCountText: string;
    falseRowCountText: string;
  },
) {
  await expect(rowCount(page, allRowCountText)).toBeVisible();

  await filterWidget(page).click();
  await popover(page).getByRole("button", { name: "Add filter" }).click();
  await expect(rowCount(page, trueRowCountText)).toBeVisible();

  await icon(filterWidget(page), "close").click();
  await expect(rowCount(page, allRowCountText)).toBeVisible();

  await filterWidget(page).click();
  await popover(page).getByText("False", { exact: true }).click();
  await popover(page).getByText("Add filter", { exact: true }).click();
  await expect(rowCount(page, falseRowCountText)).toBeVisible();

  await filterWidget(page).click();
  await popover(page).getByText("True", { exact: true }).click();
  await popover(page).getByText("Update filter", { exact: true }).click();
  await expect(rowCount(page, trueRowCountText)).toBeVisible();

  await icon(filterWidget(page), "close").click();
}
