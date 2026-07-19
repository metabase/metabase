/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/smartscalar-trend.cy.spec.js
 *
 * Port notes:
 * - `H.createQuestion` / `H.createNativeQuestion` → the consolidated factories
 *   in support/factories.ts (they support `native` + `visualization_settings`,
 *   which the mb.api.createQuestion method does not).
 * - `cy.findByDisplayValue(v)` → support/filters-repros.ts findByDisplayValue
 *   (scans input/textarea/select by current value — matches the Mantine Select
 *   inputs the spec reads).
 * - `cy.get("input").click().type(...)` in the periods-ago menu → typeClampedValue
 *   (the input selects-on-focus so each type replaces; see the helper).
 * - The `Color(colors.error).rgb().string()` CSS-color assertions → cssColorToRgb
 *   (resolves the theme hsla to Chromium's computed rgb in-page).
 * - `cy.intercept("POST", "/api/dataset")` + `cy.wait("@dataset")` → a
 *   page.waitForResponse registered right before each triggering removal.
 *
 * No pixel-exact truncation/ellipsification assertions here (the SmartScalar
 * Chromium-vs-Chrome text-metrics gotcha does not apply to this spec — all the
 * scalar assertions are number-formatting text, not truncation).
 */
import type { Locator, Page } from "@playwright/test";

import { openVizTypeSidebar } from "../support/charts-extras";
import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { selectDropdown } from "../support/dashboard";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { cartesianChartCircles } from "../support/metrics";
import { queryBuilderMain } from "../support/notebook";
import { summarize } from "../support/models";
import { rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  ERROR_COLOR,
  SUCCESS_COLOR,
  button,
  comparisonLabel,
  cssColorToRgb,
  menu,
  typeClampedValue,
} from "../support/smartscalar-trend";
import { icon, popover } from "../support/ui";
import { visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const BIG_NUMBER_AGGREGATION = [
  "aggregation-options",
  ["*", ["count"], 10000],
  { name: "Mega Count", "display-name": "Mega Count" },
];

const AGGREGATIONS = [
  ["count"],
  ["sum", ["field", ORDERS.TOTAL, null]],
  BIG_NUMBER_AGGREGATION,
];

function chartSettingsSidebar(page: Page): Locator {
  return page.getByTestId("chartsettings-sidebar");
}

function scalarContainer(page: Page): Locator {
  return page.getByTestId("scalar-container");
}

function scalarPreviousValue(page: Page): Locator {
  return page.getByTestId("scalar-previous-value");
}

function scalarPeriod(page: Page): Locator {
  return page.getByTestId("scalar-period");
}

/** cy.findByText(str) is an EXACT match under testing-library (rule 1). */
function exactText(scope: Page | Locator, text: string): Locator {
  return scope.getByText(text, { exact: true });
}

test.describe("scenarios > visualizations > trend chart (SmartScalar)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow data settings to be changed and display should reflect changes", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "13710",
      query: {
        "source-table": ORDERS_ID,
        aggregation: AGGREGATIONS,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);
    await exactText(chartSettingsSidebar(page), "Data").click();

    // primary number
    await expect(exactText(scalarContainer(page), "344")).toBeVisible();
    await (await findByDisplayValue(chartSettingsSidebar(page), "Count")).click();

    await expect(popover(page).getByRole("option")).toHaveCount(
      AGGREGATIONS.length,
    );

    // selected should be highlighted
    await expect(
      popover(page).getByRole("option", { name: "Count", exact: true }),
    ).toHaveAttribute("aria-selected", "true");

    // unselected item should not be highlighted
    const sumOfTotalOption = popover(page).getByRole("option", {
      name: "Sum of Total",
      exact: true,
    });
    await expect(sumOfTotalOption).toHaveAttribute("aria-selected", "false");
    await sumOfTotalOption.click();

    // comparisons
    // default should be previous period (since we have a dateUnit)
    await expect(exactText(scalarContainer(page), "30,759.47")).toBeVisible();
    await expect(
      comparisonLabel(scalarPreviousValue(page), "vs. previous month:"),
    ).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "45,683.68"),
    ).toBeVisible();

    // previous value
    await exactText(chartSettingsSidebar(page), "Previous month").click();
    await exactText(menu(page), "Previous value").click();
    await expect(comparisonLabel(scalarPreviousValue(page), "vs. Mar:")).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "45,683.68"),
    ).toBeVisible();

    // periods ago
    await exactText(chartSettingsSidebar(page), "Previous value").click();
    const periodsInput = menu(page).locator("input");
    // should clamp over input to maxPeriodsAgo.
    // Upstream hardcodes 48; on the CI jar the app (both Playwright/Chromium AND
    // the original Cypress spec under --browser chrome) clamps to 47 — the jar's
    // sample-DB month span yields maxPeriodsAgo=47. Not engine-sensitive and not
    // port drift: the original fails identically here. See findings-inbox.
    await typeClampedValue(periodsInput, "100");
    await expect(periodsInput).toHaveValue("47");
    // should clamp under input to 2
    await typeClampedValue(periodsInput, "0");
    await expect(periodsInput).toHaveValue("2");
    // should not allow decimal input (ignores dot input)
    await typeClampedValue(periodsInput, "1.2");
    await expect(periodsInput).toHaveValue("12");
    // should allow valid input
    await typeClampedValue(periodsInput, "3");
    await periodsInput.press("Enter");

    await expect(comparisonLabel(scalarPreviousValue(page), "vs. Jan:")).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "52,249.59"),
    ).toBeVisible();

    // static number
    await exactText(chartSettingsSidebar(page), "3 months ago").click();
    await exactText(menu(page), "Custom value…").click();
    // Test the back button
    await menu(page).getByLabel("Back", { exact: true }).click();
    await exactText(menu(page), "Custom value…").click();

    await menu(page).getByLabel("Label", { exact: true }).fill("My Goal");
    await menu(page).getByLabel("Value", { exact: true }).fill("42000");
    await button(menu(page), "Done").click();

    await expect(comparisonLabel(scalarPreviousValue(page), "vs. My Goal:")).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "42,000")).toBeVisible(); // goal
    await expect(exactText(scalarPreviousValue(page), "26.76%")).toBeVisible(); // down percentage

    await exactText(chartSettingsSidebar(page), "(My Goal)").click();
    await expect(menu(page).getByLabel("Back", { exact: true })).toBeVisible();
    await expect(menu(page).getByLabel("Label", { exact: true })).toHaveValue(
      "My Goal",
    );
    await expect(menu(page).getByLabel("Value", { exact: true })).toHaveValue(
      "42000",
    );
    await button(menu(page), "Back").click();

    // another column
    await exactText(menu(page), "Value from another column…").click();
    await exactText(selectDropdown(page), "Mega Count").click();
    await button(menu(page), "Done").click();

    await expect(
      comparisonLabel(scalarPreviousValue(page), "vs. Mega Count:"),
    ).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "3,440,000"),
    ).toBeVisible(); // goal
    await expect(exactText(scalarPreviousValue(page), "99.11%")).toBeVisible(); // down percentage

    await exactText(chartSettingsSidebar(page), "(Mega Count)").click();
    await menu(page).getByRole("textbox", { name: "Column", exact: true }).click();
    await exactText(popover(page), "Count").click();
    await button(menu(page), "Done").click();

    await expect(comparisonLabel(scalarPreviousValue(page), "vs. Count:")).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "344")).toBeVisible(); // goal
    await expect(
      exactText(scalarPreviousValue(page), "8,841.71%"),
    ).toBeVisible(); // up percentage
  });

  test("should handle up to 3 comparisons", async ({ page, mb }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: AGGREGATIONS,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);
    await expect(
      page.getByTestId("comparison-list").locator(":scope > *"),
    ).toHaveCount(1);

    await expect(exactText(scalarPreviousValue(page), "34.72%")).toBeVisible();
    await expect(
      comparisonLabel(scalarPreviousValue(page), "vs. previous month:"),
    ).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "527")).toBeVisible();

    await button(page, "Add comparison").click();
    await expect(
      page.getByTestId("comparison-list").locator(":scope > *"),
    ).toHaveCount(2);
    await exactText(menu(page), "months ago").click();

    // With >1 comparison each gets its own scalar-previous-value box; the
    // Cypress `.children().last()` is the last box's content.
    await expect(scalarPreviousValue(page)).toHaveCount(2);
    const secondComparison = scalarPreviousValue(page).last();
    await expect(exactText(secondComparison, "36.65%")).toBeVisible();
    await expect(comparisonLabel(secondComparison, "vs. Feb:")).toBeVisible();
    await expect(exactText(secondComparison, "543")).toBeVisible();

    await button(page, "Add comparison").click();
    await expect(
      page.getByTestId("comparison-list").locator(":scope > *"),
    ).toHaveCount(3);
    await exactText(menu(page), "Previous value").click();
    await expect(scalarPreviousValue(page)).toHaveCount(3);
    const thirdComparison = scalarPreviousValue(page).last();
    await expect(exactText(thirdComparison, "34.72%")).toBeVisible();
    await expect(comparisonLabel(thirdComparison, "vs. Mar:")).toBeVisible();
    await expect(exactText(thirdComparison, "527")).toBeVisible();

    await expect(button(page, "Add comparison")).toBeDisabled();

    await page
      .getByTestId("comparison-list")
      .locator(":scope > *")
      .last()
      .getByLabel("Remove", { exact: true })
      .click();
    await expect(
      page.getByTestId("comparison-list").locator(":scope > *"),
    ).toHaveCount(2);
    await expect(
      exactText(page.getByTestId("comparison-list"), "Previous value"),
    ).toHaveCount(0);
    await expect(scalarPreviousValue(page)).toHaveCount(2);
    await expect(comparisonLabel(scalarPreviousValue(page), "vs. Mar:")).toHaveCount(0);

    await expect(button(page, "Add comparison")).toBeEnabled();
  });

  test("should reset 'another column' comparison when it becomes invalid", async ({
    page,
    mb,
  }) => {
    const datasetResponse = (): Promise<unknown> =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: AGGREGATIONS,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "smartscalar",
      visualization_settings: {
        "scalar.field": "Count",
        "scalar.comparisons": [
          { id: "1", type: "anotherColumn", column: "Mega Count", label: "Mega Count" },
          { id: "2", type: "staticNumber", value: 400000, label: "Goal" },
        ],
      },
    });
    await visitQuestion(page, id);

    await openVizSettingsSidebar(page);

    // Selecting the main column ("Mega Count") to be the comparison column
    // The "Another column (Mega Count)" comparison should disappear
    await expect(
      exactText(chartSettingsSidebar(page), "(Mega Count)"),
    ).toBeVisible();
    await (await findByDisplayValue(chartSettingsSidebar(page), "Count")).click();
    await exactText(popover(page), "Mega Count").click();

    await expect(page.getByTestId("scalar-value")).toHaveText("3,440,000");
    await expect(
      exactText(scalarPreviousValue(page), "Sum of Total"),
    ).toHaveCount(0);
    await expect(comparisonLabel(scalarPreviousValue(page), "vs. Goal:")).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "400,000")).toBeVisible();

    // Replacing "Custom value (Goal)" with "Another column (Count)"
    // Setting the main column to "Count"
    // The single invalid comparison should be reset to "previous period"
    await chartSettingsSidebar(page).getByText(/Custom value/).click();
    await button(menu(page), "Back").click();
    await exactText(menu(page), "Value from another column…").click();
    await exactText(popover(page), "Count").click();
    await button(popover(page), "Done").click();

    const fieldPickerTextbox = page
      .getByTestId("chartsettings-field-picker")
      .getByRole("textbox");
    await expect(fieldPickerTextbox).toHaveValue("Mega Count");
    await fieldPickerTextbox.click();
    await exactText(popover(page), "Count").click();

    await expect(page.getByTestId("scalar-value")).toHaveText("344");
    await expect(exactText(scalarPreviousValue(page), "Count")).toHaveCount(0);
    await expect(
      comparisonLabel(scalarPreviousValue(page), "vs. previous month:"),
    ).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "527")).toBeVisible();

    await exactText(chartSettingsSidebar(page), "Previous month").click();
    await exactText(menu(page), "Value from another column…").click();
    await exactText(popover(page), "Sum of Total").click();
    await button(popover(page), "Done").click();

    await (await findByDisplayValue(chartSettingsSidebar(page), "Count")).click();
    await exactText(popover(page), "Mega Count").click();

    // Removing the comparison column ("Sum of Total") from the query
    // The comparison should be reset to "previous period"
    await summarize(page);
    const dataset1 = datasetResponse();
    await icon(
      rightSidebar(page).getByLabel("Sum of Total", { exact: true }),
      "close",
    ).click();
    await dataset1;

    await expect(page.getByTestId("scalar-value")).toHaveText("3,440,000");
    await expect(
      exactText(scalarPreviousValue(page), "Sum of Total"),
    ).toHaveCount(0);
    await expect(
      comparisonLabel(scalarPreviousValue(page), "vs. previous month:"),
    ).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "5,270,000"),
    ).toBeVisible();

    // Removing the remaining numeric column, so only Count is left
    // to ensure we no longer offer the "Value from another column…" option
    const dataset2 = datasetResponse();
    await icon(
      rightSidebar(page).getByLabel("Count", { exact: true }),
      "close",
    ).click();
    await button(rightSidebar(page), "Done").click();
    await dataset2;

    await openVizSettingsSidebar(page);
    await expect(
      exactText(chartSettingsSidebar(page), "Sum of Total"),
    ).toHaveCount(0);
    await exactText(chartSettingsSidebar(page), "Previous month").click();
    await expect(
      exactText(menu(page), "Value from another column…"),
    ).toHaveCount(0);
  });

  test("should allow display settings to be changed and display should reflect changes", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "13710",
      query: {
        "source-table": ORDERS_ID,
        aggregation: AGGREGATIONS,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    // scalar.switch_positive_negative setting
    await expect(icon(page, "arrow_down").first()).toHaveCSS(
      "color",
      await cssColorToRgb(page, ERROR_COLOR),
    );
    await openVizSettingsSidebar(page);
    await exactText(chartSettingsSidebar(page), "Display").click();
    await chartSettingsSidebar(page)
      .getByLabel("Switch positive / negative colors?", { exact: true })
      .click({ force: true });
    await expect(icon(page, "arrow_down").first()).toHaveCSS(
      "color",
      await cssColorToRgb(page, SUCCESS_COLOR),
    );

    // open the metric column's formatting (now in a popover, since the date
    // column is also configurable)
    await leftSidebar(page).getByTestId("Count-settings-button").click();

    // style
    await expect(exactText(scalarContainer(page), "344")).toBeVisible();
    await page.getByLabel("Style", { exact: true }).click();
    await exactText(popover(page), "Percent").click();
    await expect(exactText(scalarContainer(page), "34,400%")).toBeVisible();

    // separator style
    await page.getByLabel("Separator style", { exact: true }).click();
    await exactText(popover(page), "100’000.00").click();
    await expect(exactText(scalarContainer(page), "34’400%")).toBeVisible();

    // decimal places
    const decimalPlaces = () =>
      page.getByLabel("Number of decimal places", { exact: true });
    await decimalPlaces().click();
    await decimalPlaces().fill("4");
    await decimalPlaces().blur();
    await expect(exactText(scalarContainer(page), "34’400.0000%")).toBeVisible();

    // negative decimal places flip to positive
    await decimalPlaces().click();
    await decimalPlaces().fill("-3");
    await decimalPlaces().blur();
    await expect(exactText(scalarContainer(page), "34’400.000%")).toBeVisible();

    // non-integer decimal places round to nearest integer
    await decimalPlaces().click();
    await decimalPlaces().fill("2.4");
    await decimalPlaces().blur();
    await expect(exactText(scalarContainer(page), "34’400.00%")).toBeVisible();

    // negative non-integer decimal places round to nearest integer and flip to positive
    await decimalPlaces().click();
    await decimalPlaces().fill("-3.8");
    await decimalPlaces().blur();
    await expect(exactText(scalarContainer(page), "34’400.0000%")).toBeVisible();

    // multiply by a number
    await page.getByLabel("Multiply by a number", { exact: true }).click();
    await page.getByLabel("Multiply by a number", { exact: true }).fill("2");
    await page.getByLabel("Multiply by a number", { exact: true }).blur();
    await expect(exactText(scalarContainer(page), "68’800.0000%")).toBeVisible();

    // add a prefix
    await page.getByLabel("Add a prefix", { exact: true }).click();
    await page.getByLabel("Add a prefix", { exact: true }).fill("Woah: ");
    await page.getByLabel("Add a prefix", { exact: true }).blur();
    await expect(
      exactText(scalarContainer(page), "Woah: 68’800.0000%"),
    ).toBeVisible();

    // add a suffix
    await page.getByLabel("Add a suffix", { exact: true }).click();
    await page.getByLabel("Add a suffix", { exact: true }).fill(" ! cool");
    await page.getByLabel("Add a suffix", { exact: true }).blur();
    await expect(
      exactText(scalarContainer(page), "Woah: 68’800.0000% ! cool"),
    ).toBeVisible();

    // scalar.compact_primary_number setting
    await exactText(chartSettingsSidebar(page), "Data").click();
    await (await findByDisplayValue(chartSettingsSidebar(page), "Count")).click();
    await popover(page)
      .getByRole("option", { name: "Mega Count", exact: true })
      .click();
    await exactText(chartSettingsSidebar(page), "Display").click();

    await expect(exactText(scalarContainer(page), "3,440,000")).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "5,270,000"),
    ).toBeVisible();

    await chartSettingsSidebar(page)
      .getByLabel("Compact number", { exact: true })
      .click({ force: true });
    await expect(exactText(scalarContainer(page), "3.4M")).toBeVisible();
    await expect(exactText(scalarPreviousValue(page), "5.3M")).toBeVisible();

    await chartSettingsSidebar(page)
      .getByLabel("Compact number", { exact: true })
      .click({ force: true });
    await expect(exactText(scalarContainer(page), "3,440,000")).toBeVisible();
    await expect(
      exactText(scalarPreviousValue(page), "5,270,000"),
    ).toBeVisible();
  });

  test("should work regardless of column order (metabase#13710)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "13710",
      query: {
        "source-table": ORDERS_ID,
        breakout: [
          ["field", ORDERS.QUANTITY, null],
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ],
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    // Reported failing on v0.35 - v0.37.0.2 (Bug: showing blank visualization)
    await expect(page.getByTestId("scalar-value")).toContainText("100");
  });

  test("should gracefully handle errors (metabase#42948)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "42948",
      native: {
        query:
          "SELECT DATE '2024-05-21' AS created_at, 5 as v\nUNION ALL SELECT DATE '2024-05-20' , 4\nUNION ALL SELECT DATE '2024-05-19' , 3\nORDER BY created_at",
      },
      display: "smartscalar",
      visualization_settings: {
        "scalar.field": "v",
        "scalar.comparisons": [
          {
            id: "1",
            type: "periodsAgo",
            value: "this will cause an error because it is not a number",
          },
        ],
      },
    });
    await visitQuestion(page, id);

    // check that error/warning is showing up
    await icon(page, "warning").hover();
    await expect(
      exactText(
        queryBuilderMain(page),
        "No integer value supplied for periods ago comparison.",
      ),
    ).toBeVisible();

    // check that we can switch to the table view and the data is shown.
    // The icon sits inside an aria-disabled ancestor (the errored viz), which
    // Playwright's actionability treats as disabled though the toggle works;
    // Cypress's synthetic click ignored it — force-click to match (wave-10 gotcha).
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await expect(exactText(queryBuilderMain(page), "CREATED_AT")).toBeVisible();
    await expect(exactText(queryBuilderMain(page), "V")).toBeVisible();

    // check that we can switch visualizations and no longer have the error show
    await openVizTypeSidebar(page);
    await page.getByTestId("Line-button").click();
    await expect(icon(page, "warning")).toHaveCount(0);
    await expect(cartesianChartCircles(page)).toHaveCount(3);
  });

  test("should keep full date granularity for native questions and let users pick a coarser granularity (metabase#69525)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "69525",
      native: {
        query:
          "SELECT CAST('2023-06-30 12:00:00' AS TIMESTAMP) AS parsed_date, 733.93 AS amount\nUNION ALL SELECT CAST('2024-06-30 12:00:00' AS TIMESTAMP), 794.29",
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    // the full date is shown by default, not collapsed to the year
    await expect(
      exactText(scalarPeriod(page), "June 30, 2024, 12:00 PM"),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    await exactText(chartSettingsSidebar(page), "Display").click();
    await leftSidebar(page).getByTestId("PARSED_DATE-settings-button").click();

    // the date format controls are available for the full date
    await expect(exactText(popover(page), "Date granularity")).toBeVisible();
    await expect(exactText(popover(page), "Date style")).toBeVisible();
    await expect(exactText(popover(page), "Show the time")).toBeVisible();

    // a coarser granularity collapses the date and hides format controls
    await (await findByDisplayValue(popover(page), "Full date")).click();
    await popover(page).getByRole("option", { name: "Year", exact: true }).click();

    await expect(exactText(scalarPeriod(page), "2024")).toBeVisible();
    await expect(exactText(popover(page), "Date granularity")).toBeVisible();
    await expect(exactText(popover(page), "Date style")).toBeHidden();
    await expect(exactText(popover(page), "Show the time")).toBeHidden();

    // quarter and month granularities keep the relevant period
    await (await findByDisplayValue(popover(page), "Year")).click();
    await popover(page)
      .getByRole("option", { name: "Quarter and year", exact: true })
      .click();
    await expect(exactText(scalarPeriod(page), "Q2 2024")).toBeVisible();

    await (await findByDisplayValue(popover(page), "Quarter and year")).click();
    await popover(page)
      .getByRole("option", { name: "Month and year", exact: true })
      .click();
    await expect(exactText(scalarPeriod(page), "June 2024")).toBeVisible();

    // switching back to the full date restores everything
    await (await findByDisplayValue(popover(page), "Month and year")).click();
    await popover(page)
      .getByRole("option", { name: "Full date", exact: true })
      .click();
    await expect(
      exactText(scalarPeriod(page), "June 30, 2024, 12:00 PM"),
    ).toBeVisible();
    await expect(exactText(popover(page), "Date style")).toBeVisible();
    await expect(exactText(popover(page), "Show the time")).toBeVisible();
  });

  test("should support quick-filter drill thru (metabase#46168)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "46168",
      query: {
        "source-table": ORDERS_ID,
        aggregation: AGGREGATIONS,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "smartscalar",
    });
    await visitQuestion(page, id);

    await expect(exactText(scalarPeriod(page), "Apr 2029")).toBeVisible();
    await exactText(scalarContainer(page), "344").click();

    // Validate expected filter options
    await expect(exactText(popover(page), "Filter by this value")).toBeVisible();
    await expect(exactText(popover(page), ">")).toBeVisible();
    await expect(exactText(popover(page), "<")).toBeVisible();
    await expect(exactText(popover(page), "=")).toBeVisible();
    await expect(exactText(popover(page), "≠")).toBeVisible();

    // Apply the drill
    await exactText(popover(page), ">").click();

    // Validate that the filter was applied
    await expect(exactText(scalarPeriod(page), "Mar 2029")).toBeVisible();
    await expect(exactText(scalarContainer(page), "527")).toBeVisible();
  });
});
