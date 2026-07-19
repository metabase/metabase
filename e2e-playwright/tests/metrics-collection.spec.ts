/**
 * Playwright port of e2e/test/scenarios/metrics/metrics-collection.cy.spec.js
 *
 * Metrics shown in a collection view: list them (pinned scalar + timeseries),
 * pin/unpin, bookmark/unbookmark, hide the visualization for a pinned metric,
 * and archive/unarchive/delete a metric from the collection.
 *
 * All helpers are shared imports — no new module was needed. `openArchive` is
 * spec-local (as it was in Cypress).
 *
 * Intercept: the bookmark test's `@cardQuery` (POST /api/card/*\/query) IS
 * awaited (twice), so it is ported via waitForCardQuery, registered before the
 * triggering action (rule 2).
 */
import { test, expect } from "../support/fixtures";
import { createQuestion } from "../support/factories";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  getPinnedSection,
  getUnpinnedSection,
  openPinnedItemMenu,
  openUnpinnedItemMenu,
  waitForCardQuery,
} from "../support/collections";
import { undo } from "../support/dashboard-parameters";
import { undoToastList } from "../support/organization";
import { modal, navigationSidebar, popover } from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
  collection_position: 1,
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Count of orders over time",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
  collection_position: 1,
};

test.describe("scenarios > metrics > collection", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show metrics in collections", async ({ page, mb }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await createQuestion(mb.api, ORDERS_TIMESERIES_METRIC);
    await page.goto("/collection/root");

    const pinned = getPinnedSection(page);
    await expect(pinned.getByText("Metrics", { exact: true })).toBeVisible();
    await expect(
      pinned.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
    ).toBeVisible();
    await expect(
      pinned.getByTestId("scalar-container").getByText("18,760", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pinned.getByText(ORDERS_TIMESERIES_METRIC.name, { exact: true }),
    ).toBeVisible();
    await expect(pinned.getByTestId("chart-container")).toBeVisible();
  });

  test("should be possible to pin and unpin metrics", async ({ page, mb }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await page.goto("/collection/root");

    await expect(
      getPinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getUnpinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);

    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    await popover(page).getByText("Unpin", { exact: true }).click();
    await expect(getPinnedSection(page)).toHaveCount(0);
    await expect(
      getUnpinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();

    await openUnpinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    await popover(page).getByText("Pin this", { exact: true }).click();
    await expect(
      getPinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getUnpinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("should be possible to add and remove a metric from bookmarks", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await createQuestion(mb.api, {
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });

    const firstQuery = waitForCardQuery(page);
    await page.goto("/collection/root");
    await firstQuery;

    await expect(getPinnedSection(page)).toContainText("18,760");
    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);

    // The Bookmark click makes the pinned card "blink" and re-run its query.
    const bookmarkQuery = waitForCardQuery(page);
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expect(
      navigationSidebar(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();

    // pinned card should 'blink' to load and later show the data
    await bookmarkQuery;
    await expect(getPinnedSection(page)).toContainText("18,760");

    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    await popover(page).getByText("Remove from bookmarks", { exact: true }).click();
    await expect(
      navigationSidebar(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);

    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expect(
      navigationSidebar(page).getByText(ORDERS_TIMESERIES_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();
    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Remove from bookmarks", { exact: true }).click();
    await expect(
      navigationSidebar(page).getByText(ORDERS_TIMESERIES_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("should be possible to hide the visualization for a pinned metric", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await page.goto("/collection/root");

    {
      const pinned = getPinnedSection(page);
      await expect(
        pinned.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(pinned.getByTestId("scalar-container")).toBeVisible();
    }

    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    // The apostrophe is U+2019 (right single quotation mark), as upstream.
    await popover(page).getByText("Don’t show visualization", { exact: true }).click();
    {
      const pinned = getPinnedSection(page);
      await expect(
        pinned.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(pinned.getByTestId("scalar-container")).toHaveCount(0);
    }

    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    await popover(page).getByText("Show visualization", { exact: true }).click();
    {
      const pinned = getPinnedSection(page);
      await expect(
        pinned.getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
      await expect(pinned.getByTestId("scalar-container")).toBeVisible();
    }
  });

  test("should be possible to archive, unarchive, and delete a metric", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, ORDERS_SCALAR_METRIC);
    await createQuestion(mb.api, {
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });
    await page.goto("/collection/root");

    await openPinnedItemMenu(page, ORDERS_SCALAR_METRIC.name);
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await expect(getPinnedSection(page)).toHaveCount(0);
    await expect(
      undoToastList(page).last().getByText("Trashed metric", { exact: true }),
    ).toBeVisible();
    await undo(page);
    await expect(
      getPinnedSection(page).getByText(ORDERS_SCALAR_METRIC.name, {
        exact: true,
      }),
    ).toBeVisible();

    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await expect(
      getUnpinnedSection(page).getByText(ORDERS_TIMESERIES_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      undoToastList(page).last().getByText("Trashed metric", { exact: true }),
    ).toBeVisible();

    await openArchive(page);
    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Restore", { exact: true }).click();
    await expect(
      getUnpinnedSection(page).getByText(ORDERS_TIMESERIES_METRIC.name, {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      undoToastList(page)
        .last()
        .getByText(`${ORDERS_TIMESERIES_METRIC.name} has been restored.`, {
          exact: true,
        }),
    ).toBeVisible();

    await navigationSidebar(page).getByText("Our analytics", { exact: true }).click();
    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await openArchive(page);
    await openUnpinnedItemMenu(page, ORDERS_TIMESERIES_METRIC.name);
    await popover(page).getByText("Delete permanently", { exact: true }).click();
    await modal(page).getByRole("button", { name: "Delete permanently" }).click();
    await expect(getUnpinnedSection(page)).toHaveCount(0);
    await expect(
      undoToastList(page)
        .last()
        .getByText("This item has been permanently deleted.", { exact: true }),
    ).toBeVisible();
  });
});

async function openArchive(page: import("@playwright/test").Page) {
  await navigationSidebar(page).getByText("Trash", { exact: true }).click();
}
