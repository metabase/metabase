/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/progress-bar.cy.spec.js
 *
 * Port notes:
 * - `H.createQuestion(details, { visitQuestion: true })` → factories.createQuestion
 *   (which supports `visualization_settings`, unlike mb.api.createQuestion) + the
 *   shared visitQuestion(page, id) navigation.
 * - `H.createQuestionAndDashboard` → factories.createQuestionAndDashboard, then a
 *   PUT to resize the dashcard (mirrors the original's inline cy.request).
 * - `H.visitQuestionAdhoc` with a native, autorunnable query → visitNativeQuestionAdhoc
 *   (charts-extras) — the ad-hoc native query does not run from the URL hash, so
 *   the helper clicks Run and waits for the dataset response.
 * - `cy.findByDisplayValue(v)` → filters-repros.findByDisplayValue (scans
 *   input/textarea/select by current value — matches the Mantine Select inputs).
 *   The `.should("be.visible")` re-checks are wrapped in expect.poll/toPass since
 *   the sidebar Select re-renders asynchronously after a value change.
 * - `findByText` string args → exact matches (rule 1); `cy.contains("Goal 1,000")`
 *   → case-sensitive substring regex.
 * - `SAMPLE_DATABASE.id` (regenerated at Cypress start, absent from the committed
 *   fixture JSON) → SAMPLE_DB_ID (1).
 *
 * The "18,760" / "Goal 0" / "Goal exceeded" labels are progress-bar DOM text
 * (not SVG/canvas), so no Chromium-vs-Chrome text-metrics gotcha applies.
 */
import { openVizSettingsSidebar } from "../support/charts";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { dashboardCards } from "../support/dashboard-tabs";
import { createQuestion, createQuestionAndDashboard } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { queryBuilderMain } from "../support/notebook";
import { goalColumnDropdown } from "../support/progress-bar";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { icon, popover, visitDashboard, visitQuestion } from "../support/ui";
import { vizSettingsSidebar } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > progress chart", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should render progress bar in query builder and dashboard (metabase#40658, metabase#41243)", async ({
    page,
    mb,
  }) => {
    const QUESTION_NAME = "40658";
    const questionDetails = {
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    // check dashboard chart render
    const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
      mb.api,
      { questionDetails },
    );

    // Make dashboard card really small (necessary for this repro as it doesn't
    // show any labels)
    await mb.api.put(`/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 5,
          size_y: 4,
          parameter_mappings: [],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboard_id);

    const firstCard = dashboardCards(page).first();
    await expect(firstCard.getByText("18,760", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Goal 0", { exact: true })).toBeVisible();
    await expect(
      firstCard.getByText("Goal exceeded", { exact: true }),
    ).toBeVisible();

    // check query builder chart render
    await firstCard.getByText(QUESTION_NAME, { exact: true }).click();
    const qbMain = queryBuilderMain(page);
    await expect(qbMain.getByText("18,760", { exact: true })).toBeVisible();
    await expect(qbMain.getByText("Goal 0", { exact: true })).toBeVisible();
    await expect(
      qbMain.getByText("Goal exceeded", { exact: true }),
    ).toBeVisible();
  });

  test("should allow value field selection with multiple numeric columns", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Multi-column Progress Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      },
      display: "progress",
    });
    await visitQuestion(page, id);

    // Open visualization settings
    await openVizSettingsSidebar(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    // Should show Value field selector since we have multiple numeric columns
    await expect(sidebar.getByText("Value", { exact: true })).toBeVisible();

    // Default should be first column (Count)
    await expect(await findByDisplayValue(sidebar, "Count")).toBeVisible();

    // Change to Sum of Total
    await (await findByDisplayValue(sidebar, "Count")).click();

    await popover(page).getByText("Sum of Total", { exact: true }).click();

    // Verify the field changed
    await expect
      .poll(async () => {
        try {
          return await (
            await findByDisplayValue(sidebar, "Sum of Total")
          ).isVisible();
        } catch {
          return false;
        }
      })
      .toBe(true);
  });

  test("should not show value field selector with single numeric column", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Single Column Progress Test",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    // Should NOT show Value field selector since we only have one numeric column
    await expect(sidebar.getByText("Value", { exact: true })).toHaveCount(0);

    // Goal setting should still be visible with no dropdown since no other columns
    await expect(sidebar.getByText("Goal", { exact: true })).toBeVisible();

    // No dropdown icon should be visible since there are no other columns for goal
    await expect(
      sidebar
        .getByPlaceholder("Enter goal value", { exact: true })
        .locator("../..")
        .locator(".Icon-chevrondown"),
    ).toHaveCount(0);
  });

  test("should exclude value column from goal column options and include Custom value option", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Exclusion Test Progress",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.QUANTITY, null]],
        ],
      },
      display: "progress",
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    // Set value field to Sum of Total
    await (await findByDisplayValue(sidebar, "Count")).click();

    await popover(page).getByText("Sum of Total", { exact: true }).click();

    await goalColumnDropdown(sidebar).click();

    // Should show Custom value, Count and Average of Quantity, but not Sum of Total
    const goalPopover = popover(page);
    await expect(
      goalPopover.getByText("Custom value", { exact: true }),
    ).toBeVisible();
    await expect(goalPopover.getByText("Count", { exact: true })).toHaveCount(1);
    await expect(
      goalPopover.getByText("Average of Quantity", { exact: true }),
    ).toBeVisible();
    await expect(
      goalPopover.getByText("Sum of Total", { exact: true }),
    ).toHaveCount(0);

    // Select Count
    await goalPopover.getByText("Count", { exact: true }).click();

    // Goal should show Count selected in the input. The original asserts
    // `should("exist")` — the selected column name renders in a hidden element,
    // so port as existence (toBeAttached), not visibility.
    await expect(
      sidebar.getByText("Count", { exact: true }).first(),
    ).toBeAttached();
  });

  test("should be backwards compatibile", async ({ page, mb }) => {
    // A question with numeric `progress.goal` and no `progress.value` should
    // render a progress bar with the goal value
    const { id } = await createQuestion(mb.api, {
      name: "Backwards Compat Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "progress",
      visualization_settings: {
        "progress.goal": 1000,
      },
    });
    await visitQuestion(page, id);

    const qbMain = queryBuilderMain(page);
    await expect(qbMain.getByText("18,760", { exact: true })).toBeVisible();
    await expect(
      qbMain.getByText(caseSensitiveSubstring("Goal 1,000")).first(),
    ).toBeVisible();
  });

  test("should allow switching between custom value and column reference via dropdown", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "Custom Value Toggle Test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      },
      display: "progress",
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    // Initially should show number input with placeholder
    await expect(
      sidebar.getByPlaceholder("Enter goal value", { exact: true }),
    ).toBeVisible();

    // Click dropdown to select a column
    await goalColumnDropdown(sidebar).click();

    // Select Sum of Total column
    await popover(page).getByText("Sum of Total", { exact: true }).click();

    // Should now show the column name in a read-only text input. The original
    // asserts `should("exist")` (the value renders in a hidden element), so port
    // as existence, not visibility.
    await expect(
      sidebar.getByText("Sum of Total", { exact: true }),
    ).toBeAttached();

    // Click dropdown again to switch back to custom value
    await goalColumnDropdown(sidebar).click();

    await popover(page).getByText("Custom value", { exact: true }).click();

    // Should be back to number input and it should be focused
    const goalInput = sidebar.getByPlaceholder("Enter goal value", {
      exact: true,
    });
    await expect(goalInput).toBeVisible();
    await expect(goalInput).toBeFocused();
  });

  test("should handle native query with both value and goal columns", async ({
    page,
  }) => {
    const query = 'select 75000 as "value", 100000 as "goal";';

    await visitNativeQuestionAdhoc(page, {
      display: "progress",
      dataset_query: {
        type: "native",
        native: {
          query,
        },
        database: SAMPLE_DB_ID,
      },
    });

    // Open visualization settings to configure value and goal columns
    await openVizSettingsSidebar(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    // Configure goal to use the "goal" column
    await goalColumnDropdown(sidebar).click();

    await popover(page).getByText("goal", { exact: true }).click();

    // Verify the progress bar displays correctly with native query data
    const qbMain = queryBuilderMain(page);
    // Should show the first row's value
    await expect(qbMain.getByText("75,000", { exact: true })).toBeVisible();
    // Should show goal from the goal column
    await expect(
      qbMain.getByText("Goal 100,000", { exact: true }),
    ).toBeVisible();
  });
});
