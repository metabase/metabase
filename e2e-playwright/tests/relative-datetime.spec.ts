/**
 * Playwright port of e2e/test/scenarios/filters/relative-datetime.cy.spec.js
 *
 * Time handling: the Cypress spec does NOT freeze time (no cy.clock) — it
 * seeds rows from the real current time and relies on the backend's "now"
 * for the filter window, so no page.clock is needed here either. One
 * deliberate change: Cypress computed `now` once at spec load, leaving the
 * minutes-unit tests a ~4-minute drift budget by the time the later tests
 * run; here `now` is captured per test so each test's rows are always fresh
 * relative to query time.
 */
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { waitForDataset } from "../support/nested-questions";
import {
  assertQueryBuilderRowCount,
  queryBuilderMain,
  tableHeaderClick,
} from "../support/notebook";
import { openTable } from "../support/binning";
import {
  STARTING_FROM_UNITS,
  addStartingFrom,
  addToDate,
  clickActionsPopover,
  nativeSQL,
  openCreatedAt,
  setRelativeDatetimeUnit,
  setRelativeDatetimeValue,
  setStartingFromValue,
  withStartingFrom,
} from "../support/relative-datetime";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > relative-datetime", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("starting from", () => {
    for (const unit of STARTING_FROM_UNITS) {
      test(`should work with Past filters (${unit} ago)`, async ({
        page,
        mb,
      }) => {
        const now = new Date();
        await nativeSQL(page, mb.api, [
          now,
          addToDate(now, -1, unit),
          addToDate(now, -14, unit),
          addToDate(now, -15, unit),
          addToDate(now, -30, unit),
        ]);
        await withStartingFrom(page, "Previous", [10, unit], [10, unit]);
        await assertQueryBuilderRowCount(page, 2);
      });
    }

    for (const unit of STARTING_FROM_UNITS) {
      test(`should work with Next filters (${unit} from now)`, async ({
        page,
        mb,
      }) => {
        const now = new Date();
        await nativeSQL(page, mb.api, [
          now,
          addToDate(now, 1, unit),
          addToDate(now, 14, unit),
          addToDate(now, 15, unit),
          addToDate(now, 30, unit),
        ]);
        await withStartingFrom(page, "Next", [10, unit], [10, unit]);
        await assertQueryBuilderRowCount(page, 2);
      });
    }

    test("should not clobber filter when value is set to 1", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await tableHeaderClick(page, "Created At");

      const container = clickActionsPopover(page);
      await container
        .getByText("Filter by this column", { exact: true })
        .click();
      await expect(icon(container, "chevronleft")).toHaveCount(0);
      const dataset = waitForDataset(page);
      await container.getByText("Previous 30 days", { exact: true }).click();
      await dataset;

      await page
        .getByTestId("qb-filters-panel")
        .getByText("Created At is in the previous 30 days", { exact: true })
        .click();

      await setRelativeDatetimeValue(page, 1);
      await setRelativeDatetimeUnit(page, "year");
      await addStartingFrom(page);
      await setStartingFromValue(page, 2);

      await expect(
        popover(page).getByRole("button", { name: "Update filter" }),
      ).toBeEnabled();
    });
  });

  test.describe("basic functionality", () => {
    test("starting from should contain units only equal or greater than the filter unit", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openCreatedAt(page);
      await addStartingFrom(page);

      const container = clickActionsPopover(page);
      await container
        .getByRole("textbox", { name: "Starting from unit", exact: true })
        .click();

      await expect(page.getByRole("option")).toHaveText([
        "days ago",
        "weeks ago",
        "months ago",
        "quarters ago",
        "years ago",
      ]);

      await setRelativeDatetimeUnit(page, /quarters/);
      await container
        .getByRole("textbox", { name: "Starting from unit", exact: true })
        .click();

      await expect(page.getByRole("option")).toHaveText([
        "quarters ago",
        "years ago",
      ]);
    });

    test("should go back to shortcuts view", async ({ page }) => {
      await openTable(page, { table: ORDERS_ID });

      await tableHeaderClick(page, "Created At");
      const container = clickActionsPopover(page);
      await container
        .getByText("Filter by this column", { exact: true })
        .click();
      await container.getByText("Fixed date range…", { exact: true }).click();
      await icon(container, "chevronleft").first().click();
      await expect(
        container.getByText("Fixed date range…", { exact: true }),
      ).toBeVisible();
      await expect(
        container.getByText("Between", { exact: true }),
      ).toHaveCount(0);
    });

    test("current filters should work (metabase#21977)", async ({ page }) => {
      await openTable(page, { table: ORDERS_ID });

      await tableHeaderClick(page, "Created At");
      const container = clickActionsPopover(page);
      await container
        .getByText("Filter by this column", { exact: true })
        .click();
      await container
        .getByText("Relative date range…", { exact: true })
        .click();
      await container.getByText("Current", { exact: true }).click();
      const dataset = waitForDataset(page);
      await container.getByText("Year", { exact: true }).click();
      await dataset;

      await expect(
        queryBuilderMain(page).getByText(
          "There was a problem with your question",
          { exact: true },
        ),
      ).toHaveCount(0);

      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Created At is this year", { exact: true }),
      ).toBeVisible();
    });

    test("Relative dates should default to past filter (metabase#22027)", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openCreatedAt(page);
      const container = clickActionsPopover(page);
      for (const text of ["Day", "Quarter", "Month", "Year"]) {
        await expect(container.getByText(text, { exact: true })).toHaveCount(0);
      }
      await expect(
        container.getByRole("textbox", { name: "Unit", exact: true }),
      ).toHaveValue("days");
    });

    test("should change the starting from units to match (metabase#22222)", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openCreatedAt(page, "Previous");
      await addStartingFrom(page);
      await setRelativeDatetimeUnit(page, "months");
      // asserts both "days ago" is gone and "months ago" is shown
      await expect(
        clickActionsPopover(page).getByRole("textbox", {
          name: "Starting from unit",
          exact: true,
        }),
      ).toHaveValue("months ago");
    });

    test("should allow changing values with starting from (metabase#22227)", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openCreatedAt(page, "Previous");
      await addStartingFrom(page);
      await setRelativeDatetimeUnit(page, "months");
      await setRelativeDatetimeValue(page, 1);
      let dataset = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await dataset;

      const filtersPanel = page.getByTestId("qb-filters-panel");
      await filtersPanel
        .getByText("Created At is in the previous month, starting 7 months ago", {
          exact: true,
        })
        .click();
      await setRelativeDatetimeValue(page, 3);
      dataset = waitForDataset(page);
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();
      await dataset;

      await filtersPanel
        .getByText(
          "Created At is in the previous 3 months, starting 7 months ago",
          { exact: true },
        )
        .click();
      await setStartingFromValue(page, 30);
      dataset = waitForDataset(page);
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();
      await dataset;

      await expect(
        filtersPanel.getByText(
          "Created At is in the previous 3 months, starting 30 months ago",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("starting from option should set correct sign (metabase#22228)", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openCreatedAt(page, "Next");
      await addStartingFrom(page);
      const dataset = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await dataset;

      const filtersPanel = page.getByTestId("qb-filters-panel");
      const baseName = "Created At is in the next 30 days";
      await expect(
        filtersPanel.getByText(`${baseName}, starting 7 days from now`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        filtersPanel.getByText(`${baseName}, starting 7 days ago`, {
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });
});
