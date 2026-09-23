/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-boolean.cy.spec.ts
 *
 * Porting notes:
 * - The upstream describe is titled "scenarios > dashboard > filters > number".
 *   That is a copy-paste misnomer (the spec is entirely about BOOLEAN filters);
 *   kept verbatim so the test identity matches upstream.
 * - Tagged `@external` upstream, and the tag is CORRECT: the beforeEach restores
 *   the `postgres-writable` snapshot and rebuilds `many_data_types` in the
 *   writable postgres container. Gated on PW_QA_DB_ENABLED.
 *   NOTE (recorded, not acted on): only the "native queries with field filters"
 *   describe actually reads `many_data_types`. The other 6 tests query the H2
 *   SAMPLE database (PRODUCTS / `products`) and would run on the `default`
 *   snapshot — same audit finding as `custom-viz` in PORTING.md. Kept faithful:
 *   the beforeEach is shared upstream, so all 9 tests stay behind the gate.
 * - Spec-local factories/flows are ported into support/dashboard-filters-boolean.ts.
 * - `http://localhost:4000/...` in the URL click-behavior test becomes
 *   `mb.baseUrl` — the port-4000 literal would leave the slot backend entirely.
 * - `cy.type(..., { parseSpecialCharSequences: false })` has no Playwright
 *   analogue and needs none: `fill()` never interprets `{{ }}`.
 * - Row-count assertions are the dashcard data-grid Footer's `rowsCount` span
 *   (textContent exactly "N rows"), not the QB footer's "Showing N rows".
 * - `findAllByText("true").first()` → `.first()` kept: Cypress `.first()`
 *   semantics AND the virtualized grid renders each row once per quadrant.
 */
import {
  dashboardHeader,
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDropdown,
  sidebar,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import {
  COLUMN_NAME,
  DASHBOARD_NAME,
  DIALECT,
  FIELD_NAME,
  PARAMETER_NAME,
  QUESTION_NAME,
  TABLE_NAME,
  createAndMapParameter,
  createNativeQuestionWithFieldFilterAndDashboard,
  createNativeQuestionWithVariableAndDashboard,
  createQuestionAndDashboard,
  setupDashboardClickBehavior,
  testParameterWidget,
} from "../support/dashboard-filters-boolean";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { test, expect } from "../support/fixtures";
import { assertTableRowsCount } from "../support/native-extras";
import { resetManyDataTypesTable } from "../support/native-filters-extras";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
} from "../support/notebook";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
} from "../support/ui";

test.describe("scenarios > dashboard > filters > number", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      `Requires the writable ${DIALECT} QA database and its ${TABLE_NAME} table (set PW_QA_DB_ENABLED)`,
    );
    await mb.restore(`${DIALECT}-writable`);
    await resetManyDataTypesTable();
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TABLE_NAME],
    });
  });

  test.describe("mbql queries", () => {
    test("should allow to map a boolean parameter to a boolean column of an MBQL query and drill-thru", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await createAndMapParameter(page);
      await saveDashboard(page);

      await testParameterWidget(page, {
        allRowCountText: "200 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "199 rows",
      });

      // drill-thru
      await filterWidget(page).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await getDashboardCard(page)
        .getByText(QUESTION_NAME, { exact: true })
        .click();
      await assertQueryBuilderRowCount(page, 1);
      await expect(
        queryBuilderFiltersPanel(page).getByText(`${COLUMN_NAME} is true`, {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should allow to use a 'Update dashboard filter' click behavior", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      // set up click behavior
      await editDashboard(page);
      await createAndMapParameter(page);
      await showDashboardCardActions(page);
      await page.getByLabel("Click behavior").click();
      await sidebar(page).getByText(COLUMN_NAME, { exact: true }).click();
      await sidebar(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await sidebar(page)
        .getByTestId("unset-click-mappings")
        .getByText(PARAMETER_NAME, { exact: true })
        .click();
      await selectDropdown(page).getByText(COLUMN_NAME, { exact: true }).click();
      await saveDashboard(page);

      // assert click behavior
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("1 row", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("200 rows", { exact: true }),
      ).toBeVisible();
    });

    test("should allow to use a 'Go to a custom destination - Saved question' click behavior", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createQuestionAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      // set up click behavior
      await editDashboard(page);
      await createAndMapParameter(page);
      await showDashboardCardActions(page);
      await page.getByLabel("Click behavior").click();
      await sidebar(page).getByText(COLUMN_NAME, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Saved question", { exact: true }).click();
      await entityPickerModal(page)
        .getByText(QUESTION_NAME, { exact: true })
        .click();
      await sidebar(page)
        .getByTestId("unset-click-mappings")
        .getByText(COLUMN_NAME, { exact: true })
        .click();
      await selectDropdown(page).getByText(COLUMN_NAME, { exact: true }).click();
      await saveDashboard(page);

      // assert click behavior
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await expect(
        queryBuilderFiltersPanel(page).getByText(`${COLUMN_NAME} is true`, {
          exact: true,
        }),
      ).toBeVisible();
      await assertTableRowsCount(page, 1);
    });

    test("should allow to use a 'Go to a custom destination - Dashboard' click behavior with a column", async ({
      page,
      mb,
    }) => {
      await setupDashboardClickBehavior(page, mb.api, {
        targetName: COLUMN_NAME,
      });

      // assert click behavior
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await expect(
        dashboardHeader(page).getByText(DASHBOARD_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });

    test("should allow to use a 'Go to a custom destination - Dashboard' click behavior with a parameter", async ({
      page,
      mb,
    }) => {
      await setupDashboardClickBehavior(page, mb.api, {
        targetName: PARAMETER_NAME,
      });

      // assert click behavior
      await filterWidget(page).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await expect(
        dashboardHeader(page).getByText(DASHBOARD_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("native queries with field filters", () => {
    test("should allow to map a boolean parameter to a boolean field filter of a SQL query and drill-thru", async ({
      page,
      mb,
    }) => {
      const { dashboardId } =
        await createNativeQuestionWithFieldFilterAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await createAndMapParameter(page);
      await saveDashboard(page);

      // ⚠️ trueRowCountText === falseRowCountText here ("1 row" either way) —
      // this call CANNOT distinguish True from False. Verbatim from upstream;
      // see findings-inbox/dashboard-filters-boolean.md.
      await testParameterWidget(page, {
        allRowCountText: "2 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "1 row",
      });

      await filterWidget(page).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await getDashboardCard(page)
        .getByText(QUESTION_NAME, { exact: true })
        .click();
      await expect(
        queryBuilderHeader(page).getByText(QUESTION_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 1);
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });

    test("should allow to use a 'Go to a custom destination - Saved question' click behavior", async ({
      page,
      mb,
    }) => {
      const { dashboardId } =
        await createNativeQuestionWithFieldFilterAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      // set up click behavior
      await editDashboard(page);
      await createAndMapParameter(page);
      await showDashboardCardActions(page);
      await page.getByLabel("Click behavior").click();
      await sidebar(page).getByText(FIELD_NAME, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Saved question", { exact: true }).click();
      await entityPickerModal(page)
        .getByText(QUESTION_NAME, { exact: true })
        .click();
      await sidebar(page)
        .getByTestId("unset-click-mappings")
        .getByText(COLUMN_NAME, { exact: true })
        .click();
      await selectDropdown(page).getByText(FIELD_NAME, { exact: true }).click();
      await saveDashboard(page);

      // assert click behavior
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await assertTableRowsCount(page, 1);
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });

    test("should allow to use a 'Go to a custom destination - URL' click behavior", async ({
      page,
      mb,
    }) => {
      const { dashboardId, questionId } =
        await createNativeQuestionWithFieldFilterAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      // set up click behavior
      await editDashboard(page);
      await createAndMapParameter(page);
      await showDashboardCardActions(page);
      await page.getByLabel("Click behavior").click();
      await sidebar(page).getByText(FIELD_NAME, { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("URL", { exact: true }).click();
      const dialog = modal(page);
      // mb.baseUrl, not the upstream localhost:4000 literal — the slot backend
      // is on its own port and 4000 is off-limits.
      await dialog
        .getByPlaceholder("e.g. http://acme.com/id/{{user_id}}")
        .fill(
          `${mb.baseUrl}/question/${questionId}?boolean={{${FIELD_NAME}}}`,
        );
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await saveDashboard(page);

      // assert click behavior
      await getDashboardCard(page)
        .getByText("true", { exact: true })
        .first()
        .click();
      await assertTableRowsCount(page, 1);
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("native queries with variables", () => {
    test("should allow to map a boolean parameter to a boolean variable of a SQL query and drill-thru", async ({
      page,
      mb,
    }) => {
      const { dashboardId } =
        await createNativeQuestionWithVariableAndDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
      await createAndMapParameter(page);
      await saveDashboard(page);

      await testParameterWidget(page, {
        allRowCountText: "200 rows",
        trueRowCountText: "53 rows",
        falseRowCountText: "54 rows",
      });

      await filterWidget(page).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await getDashboardCard(page)
        .getByText(QUESTION_NAME, { exact: true })
        .click();
      await expect(
        queryBuilderHeader(page).getByText(QUESTION_NAME, { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 53);
      await expect(
        filterWidget(page).getByText("True", { exact: true }),
      ).toBeVisible();
    });
  });
});
