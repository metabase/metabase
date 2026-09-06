/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-text-category.cy.spec.js
 *
 * Text/category dashboard filters: connecting each operator (Is / Is not /
 * Contains / Does not contain / Starts with / Ends with), entering values
 * through the widget, applying, verifying the resulting rows, and resetting.
 *
 * Notes on the port:
 * - The Cypress `waitDashboardCardQuery()` resolved a per-dashcard alias
 *   registered by H.visitDashboard. There is a single dashcard here, so the
 *   generic waitForDashcardQuery matcher is equivalent — registered BEFORE the
 *   triggering action (save / apply / clear / reload) and awaited after (rule 2).
 * - `cy.location(...)` assertions become expect.poll (they were retried in
 *   Cypress; a one-shot check races the navigation).
 * - The disabled Save / Done buttons carry Mantine tooltips; hovering them uses
 *   { force: true } because the disabled control does not itself receive pointer
 *   events.
 * - Upstream typo `negativeASsertion` (see DASHBOARD_TEXT_FILTERS): the negative
 *   assertion never runs for 7 of the 10 operators. The loop guards on presence,
 *   preserving that behaviour.
 */
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { toggleFilterWidgetValues } from "../support/dashboard-card-repros";
import { clearFilterWidget } from "../support/dashboard-parameters";
import {
  DASHBOARD_TEXT_FILTERS,
  applyFilterByType,
  clickDefaultValueToggle,
  dashboardSaveButton,
  selectDefaultValueFromPopover,
  waitForDashcardQuery,
} from "../support/dashboard-filters-text-category";
import { toggleRequiredParameter } from "../support/embedding-dashboard";
import { dashboardParametersDoneButton } from "../support/filters-repros-2";
import { createQuestionAndDashboard } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  ensureDashboardCardHasText,
  resetFilterWidgetToDefault,
} from "../support/temporal-unit-parameters";
import { icon, popover, visitDashboard } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > dashboard > filters > text/category", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: { "source-table": ORDERS_ID, limit: 5 },
      },
      cardDetails: {
        size_x: 24,
        size_y: 8,
      },
    });

    await visitDashboard(page, mb.api, dashboard_id);
    await editDashboard(page);
  });

  test("should drill to a question with multi-value 'contains' filter applied (metabase#42999)", async ({
    page,
  }) => {
    await setFilter(page, "Text or Category", "Contains");
    await expect(
      sidebar(page).getByRole("radio", { name: "Multiple values", exact: true }),
    ).toBeChecked();
    await page
      .getByTestId("visualization-root")
      .getByText("Select…", { exact: true })
      .click();
    await popover(page).getByText("Source", { exact: true }).first().click();

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    await filterWidget(page).nth(0).click();
    const appliedQuery = waitForDashcardQuery(page);
    await applyFilterByType(page, "Contains", "oo,aa");
    await appliedQuery;

    await getDashboardCard(page).getByText("test question", { exact: true }).click();

    await expect.poll(() => page.url()).toContain("/question#");
    await expect(page.getByTestId("filter-pill")).toContainText(
      "User → Source contains 2 selections",
    );
    await expect(page.getByTestId("app-bar")).toContainText(
      "Started from test question",
    );
  });

  test("should work when set through the filter widget", async ({ page }) => {
    for (const { operator, single } of DASHBOARD_TEXT_FILTERS) {
      await setFilter(page, "Text or Category", operator);
      await expect(
        sidebar(page).getByRole("radio", {
          name: "Multiple values",
          exact: true,
        }),
      ).toBeChecked();

      if (single) {
        await sidebar(page).getByText("A single value", { exact: true }).click();
        await expect(
          sidebar(page).getByRole("radio", {
            name: "A single value",
            exact: true,
          }),
        ).toBeChecked();
      }

      await page.getByText("Select…", { exact: true }).click();
      await popover(page).getByText("Source", { exact: true }).first().click();
    }

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    for (const [
      index,
      { operator, value, representativeResult, single, negativeAssertion },
    ] of DASHBOARD_TEXT_FILTERS.entries()) {
      await filterWidget(page).nth(index).click();
      const appliedQuery = waitForDashcardQuery(page);
      await applyFilterByType(page, operator, value);
      await appliedQuery;

      await expect(filterWidget(page).nth(index)).toContainText(
        single ? value.replace(/"/g, "") : /\d selections/,
      );

      const dashcard = page.getByTestId("dashcard");
      await expect(dashcard).toContainText(representativeResult);
      if (negativeAssertion) {
        await expect(dashcard).not.toContainText(negativeAssertion);
      }

      const clearedQuery = waitForDashcardQuery(page);
      await clearFilterWidget(page, index);
      await clearedQuery;
    }
  });

  test("should reset filter state when all values are unselected (metabase#25533)", async ({
    page,
  }) => {
    const filterType = "Is";
    const filterValue = "Organic";

    await setFilter(page, "Text or Category", filterType);

    await page
      .getByTestId("dashcard")
      .getByText("Select…", { exact: true })
      .click();
    await popover(page).getByText("Source", { exact: true }).first().click();

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    await filterWidget(page).click();
    const appliedQuery = waitForDashcardQuery(page);
    await applyFilterByType(page, filterType, filterValue);
    await appliedQuery;

    await filterWidget(page).click();

    // uncheck all values
    const pop = popover(page);
    await pop.getByText(filterValue, { exact: true }).click();
    const resetQuery = waitForDashcardQuery(page);
    await pop.getByRole("button", { name: "Update filter", exact: true }).click();
    await resetQuery;

    await expect(icon(filterWidget(page), "close")).toHaveCount(0);
  });

  test("should work when set as the default filter which (if cleared) should not be preserved on reload (metabase#13960)", async ({
    page,
  }) => {
    await setFilter(page, "Text or Category", "Is");

    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Source", { exact: true }).first().click();

    await clickDefaultValueToggle(page);
    await applyFilterByType(page, "Is", "Organic");

    // We need to add another filter only to reproduce metabase#13960
    await setFilter(page, "ID");
    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("User ID", { exact: true }).first().click();

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?id=&text=Organic");
    await expect(page.getByTestId("dashcard")).toContainText("39.58");

    // This part reproduces metabase#13960
    // Remove default filter (category)
    const removedQuery = waitForDashcardQuery(page);
    await page.locator('[data-testid="parameter-widget"] .Icon-close').click();
    await removedQuery;

    await expect.poll(() => new URL(page.url()).search).toBe("?id=&text=");

    await filterWidget(page).filter({ hasText: "ID" }).click();
    await page.getByPlaceholder("Enter an ID").pressSequentially("4");
    await page.getByPlaceholder("Enter an ID").press("Enter");
    await page.getByPlaceholder("Enter an ID").blur();
    const idQuery = waitForDashcardQuery(page);
    await page.getByRole("button", { name: "Add filter", exact: true }).click();
    await idQuery;

    await expect.poll(() => new URL(page.url()).search).toBe("?id=4&text=");

    const reloadQuery = waitForDashcardQuery(page);
    await page.reload();
    await reloadQuery;

    await expect.poll(() => new URL(page.url()).search).toBe("?id=4&text=");
    await expect(filterWidget(page).filter({ hasText: "Text" })).toBeVisible();
    await expect(
      filterWidget(page).filter({ hasText: "Arnold Adams" }),
    ).toBeVisible();
  });

  test("should support being required", async ({ page }) => {
    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(page.getByTestId("dashcard"), "Source");

    // Can't save without a default value.
    // Filter the tooltip by its text: hovering the (disabled) Done button next
    // leaves the Save button's tooltip in the DOM for a beat, so a bare
    // getByRole("tooltip") matches two elements. Cypress's synthetic hover
    // never overlapped them.
    await toggleRequiredParameter(page);
    await expect(dashboardSaveButton(page)).toBeDisabled();
    await dashboardSaveButton(page).hover({ force: true });
    await expect(
      page.getByRole("tooltip").filter({
        hasText:
          'The "Text" parameter requires a default value but none was provided.',
      }),
    ).toBeVisible();

    // Can't close sidebar without a default value
    await expect(dashboardParametersDoneButton(page)).toBeDisabled();
    await dashboardParametersDoneButton(page).hover({ force: true });
    await expect(
      page.getByRole("tooltip").filter({
        hasText:
          "The parameter requires a default value but none was provided.",
      }),
    ).toBeVisible();

    // Updates the filter value
    await selectDefaultValueFromPopover(page, "Twitter", {
      buttonLabel: "Update filter",
    });
    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;
    await ensureDashboardCardHasText(page, "37.65");

    // Resets the value back by clicking widget icon
    const toggledQuery = waitForDashcardQuery(page);
    await toggleFilterWidgetValues(page, ["Google", "Organic"], {
      buttonLabel: "Update filter",
    });
    await toggledQuery;
    const resetQuery = waitForDashcardQuery(page);
    await resetFilterWidgetToDefault(page);
    await resetQuery;
    await expect(
      filterWidget(page).getByText("Twitter", { exact: true }),
    ).toBeVisible();

    // Removing value resets back to default
    await toggleFilterWidgetValues(page, ["Twitter"], {
      buttonLabel: "Set to default",
    });
    await expect(
      filterWidget(page).getByText("Twitter", { exact: true }),
    ).toBeVisible();
  });

  test("should use the list value picker for single-value category filters (metabase#49323)", async ({
    page,
  }) => {
    await setFilter(page, "Text or Category", "Is");

    await selectDashboardFilter(page.getByTestId("dashcard"), "Title");

    await sidebar(page).getByText("A single value", { exact: true }).click();
    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    await filterWidget(page).filter({ hasText: "Text" }).click();
    const pop = popover(page);
    await expect(pop.getByRole("combobox")).toHaveCount(0);
    await expect(
      pop.getByText("Aerodynamic Concrete Bench", { exact: true }),
    ).toBeVisible();
    await pop.getByText("Aerodynamic Concrete Bench", { exact: true }).click();
    await expect(
      pop.getByText("Aerodynamic Bronze Hat", { exact: true }),
    ).toBeVisible();
    await pop.getByText("Aerodynamic Bronze Hat", { exact: true }).click();
    await pop.getByRole("button", { name: "Add filter", exact: true }).click();

    await expect(
      filterWidget(page).getByText("Aerodynamic Bronze Hat", { exact: true }),
    ).toBeVisible();
  });

  test("should use the list value picker for multi-value category filters (metabase#49323)", async ({
    page,
  }) => {
    await setFilter(page, "Text or Category", "Is");

    await selectDashboardFilter(page.getByTestId("dashcard"), "Title");

    await sidebar(page).getByText("Multiple values", { exact: true }).click();
    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    await filterWidget(page).filter({ hasText: "Text" }).click();
    const pop = popover(page);
    await expect(pop.getByRole("combobox")).toHaveCount(0);
    await expect(
      pop.getByText("Aerodynamic Concrete Bench", { exact: true }),
    ).toBeVisible();
    await pop.getByText("Aerodynamic Concrete Bench", { exact: true }).click();
    await expect(
      pop.getByText("Aerodynamic Bronze Hat", { exact: true }),
    ).toBeVisible();
    await pop.getByText("Aerodynamic Bronze Hat", { exact: true }).click();
    await pop.getByRole("button", { name: "Add filter", exact: true }).click();

    await expect(
      filterWidget(page).getByText("2 selections", { exact: true }),
    ).toBeVisible();
  });
});
