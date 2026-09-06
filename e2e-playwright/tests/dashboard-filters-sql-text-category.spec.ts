/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-text-category.cy.spec.js
 *
 * One test: issue 68998 — a dashcard visualizing TWO native cards (one on the
 * H2 sample DB, one on the QA Postgres12 DB) must offer the union of both
 * datasets' category values in its text filter dropdown.
 *
 * Porting notes:
 * - Infra tier: `@external` + `H.restore("postgres-12")` + a card on database 2
 *   + `H.queryQADB` against the QA postgres container. Genuinely container-tier,
 *   so the DESCRIBE is gated on PW_QA_DB_ENABLED — describe level, not
 *   beforeEach level, because this describe has an `afterEach` that would
 *   otherwise still run (and reach for the container) on a skipped test.
 * - `cy.findByText(x)` is an EXACT testing-library match → `{ exact: true }`.
 * - `cy.intercept("POST", "/api/card/*​/query").as("cardQuery")` is registered
 *   upstream but **never waited on** — no `cy.wait("@cardQuery")` appears in the
 *   file. Reproduced as a comment rather than as a dangling `waitForResponse`,
 *   which in Playwright would be an un-awaited floating promise, not a no-op.
 * - `should("exist")` → `toBeVisible()`. Mild, deliberate strengthening:
 *   testing-library's getByText does match hidden nodes, so `exist` is strictly
 *   weaker. Each of the four is a node the user is meant to see (a chart legend,
 *   a column-list entry, a dropdown option), and the strengthening is what makes
 *   them non-hollow. Called out in findings.
 * - No absence/zero assertions in this spec at all — every assertion is
 *   positive-presence. (The `toHaveCount(0)` loader checks inside
 *   showDashcardVisualizerModal / saveDashcardVisualizerModal are the shared
 *   helpers' own, and both already carry a positive anchor.)
 *
 * Spec-local helpers live in support/dashboard-filters-sql-text-category.ts.
 */
import { expect, test } from "../support/fixtures";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  setFilter,
} from "../support/dashboard";
import { dashboardParametersPopover } from "../support/dashboard-core";
import {
  PG_DB_ID,
  QA_DB_SKIP_REASON,
  SQL_QUERY_DETAILS,
  getFieldId,
  getTableId,
  queryQADB,
} from "../support/dashboard-filters-sql-text-category";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
} from "../support/factories";
import { dashboardParametersDoneButton } from "../support/filters-repros-2";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { modal, popover } from "../support/ui";
import {
  saveDashcardVisualizerModal,
  selectDataset,
  showDashcardVisualizerModal,
  switchToAddMoreData,
  switchToColumnsList,
} from "../support/visualizer-basics";

const { PRODUCTS } = SAMPLE_DATABASE;

test.describe("issue 68998", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    // We update Postgres DB content to make sure dashcard with multiple datasets
    // return values from both DBs. Otherwise we cannot tell the difference since
    // sample data is identical.
    await queryQADB(
      "UPDATE PRODUCTS SET CATEGORY = 'New Category' where CATEGORY = 'Doohickey';",
    );

    // Upstream registers cy.intercept("POST", "/api/card/*/query").as("cardQuery")
    // here and never waits on it — deliberately not ported.
  });

  test.afterEach(async () => {
    await queryQADB(
      "UPDATE PRODUCTS SET CATEGORY = 'Doohickey' where CATEGORY = 'New Category';",
    );
  });

  test("should show all available category options for combined dataset (metabase#68998)", async ({
    page,
    mb,
  }) => {
    const tableId = await getTableId(mb.api, { name: "products" });
    // fieldId - Products.Category in Postgres DB
    const fieldId = await getFieldId(mb.api, { tableId, name: "category" });

    await createNativeQuestion(mb.api, {
      name: "SQL- Postgres",
      native: {
        query: SQL_QUERY_DETAILS,
        "template-tags": {
          field: {
            "widget-type": "string/=",
            name: "field",
            "display-name": "Field",
            id: "3db026c4-5ec6-4568-9a40-eb704bac2bde",
            type: "dimension",
            dimension: ["field", fieldId, null],
          },
        },
      },
      database: PG_DB_ID,
    });

    const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "SQL",
        native: {
          query: SQL_QUERY_DETAILS,
          "template-tags": {
            field: {
              "widget-type": "string/=",
              name: "field",
              "display-name": "Field",
              id: "c9c52a9c-ae2b-40d6-a8ee-581a529685ce",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
            },
          },
        },
        database: SAMPLE_DB_ID,
      },
      dashboardDetails: {
        name: "Issue 68998",
      },
    });

    await page.goto(`/dashboard/${dashboardId}`);

    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);
    await switchToAddMoreData(page);
    await selectDataset(page, "SQL- Postgres");
    await switchToColumnsList(page);

    await expect(
      dialog.getByText("Add more data", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("New Category", { exact: true })).toBeVisible();
    await expect(
      dialog
        .getByTestId("visualization-canvas")
        .getByText("SQL- Postgres", { exact: true }),
    ).toBeVisible();

    await saveDashcardVisualizerModal(page);

    await setFilter(page, "Text or Category", "Is");

    await getDashboardCard(page, 0)
      .getByTestId("parameter-mapper-container")
      .getByRole("button")
      .nth(0)
      .click();

    await popover(page).getByText("Field", { exact: true }).click();

    await getDashboardCard(page, 0)
      .getByTestId("parameter-mapper-container")
      .getByRole("button")
      .nth(2)
      .click();

    await popover(page).getByText("Field", { exact: true }).click();

    await dashboardParametersDoneButton(page).click();
    await saveDashboard(page);

    await filterWidget(page).click();
    await expect(
      dashboardParametersPopover(page).getByText("New Category", {
        exact: true,
      }),
    ).toBeVisible();
  });
});
