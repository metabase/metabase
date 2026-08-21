/**
 * Playwright port of e2e/test/scenarios/metrics/browse.cy.spec.ts
 *
 * The Browse > Metrics page: the sidebar link, the empty state, creating a
 * metric (including as a user without collection access), listing/browsing
 * metrics, navigating to a metric or its collection, truncated markdown, sorting,
 * the per-row dot menu (bookmark / open collection / trash, with and without
 * write access), and the EE verified-metrics filter.
 *
 * Notes:
 * - The `cy.intercept("POST", "/api/dataset").as("dataset")` in the Cypress
 *   beforeEach is never awaited — dropped (PORTING rule 2).
 * - `cy.signIn("nocollection")`/`cy.signIn("readonly")` target users that live
 *   in the snapshot login cache but not the typed USERS map — hence the
 *   `as UserName` widening (same shape as collections.spec's `"none"`).
 * - Window.open spy: Cypress's `cy.stub(win, "open")` becomes an addInitScript
 *   recorder (spyOnWindowOpen / getWindowOpenCalls).
 * - The verified-metrics describe is EE and gated on the pro-self-hosted token
 *   (the jar activates it).
 */
import type { Page } from "@playwright/test";

import type { UserName } from "../support/sample-data";

import { createQuestion } from "../support/factories";
import type { StructuredQuestionDetails } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { ORDERS_MODEL_ID } from "../support/organization";
import { NOCOLLECTION_PERSONAL_COLLECTION_NAME } from "../support/question-new";
import { getPersonalCollectionName } from "../support/question-management";
import { MetricPage } from "../support/metrics";
import { MetricEditor } from "../support/metrics-editing";
import { miniPicker } from "../support/notebook";
import { main, modal, navigationSidebar, popover } from "../support/ui";
import {
  assertMetricDescriptionEllipsified,
  findMetric,
  forceVerifiedMetricsSessionProperty,
  getMetricsTableItem,
  getWindowOpenCalls,
  metricsTable,
  shouldHaveBookmark,
  shouldNotHaveBookmark,
  spyOnWindowOpen,
  toggleVerifiedMetricsFilter,
  unverifyMetric,
  verifyMetric,
  waitForMetricSearchable,
} from "../support/metrics-browse";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

const EMPTY_STATE_TEXT =
  "Create Metrics to define the official way to calculate important numbers for your team";

const ORDERS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC: StructuredQuestionDetailsWithName = {
  name: "Orders model metric",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
  collection_id: FIRST_COLLECTION_ID,
};

const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders over time",
  type: "metric",
  description: "A metric",
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
};

const PRODUCTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const NON_NUMERIC_METRIC: StructuredQuestionDetailsWithName = {
  name: "Max of product category",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["max", ["field", PRODUCTS.CATEGORY, null]]],
  },
  display: "scalar",
};

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
  NON_NUMERIC_METRIC,
];

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

test.describe("scenarios > browse > metrics", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("no metrics", () => {
    test("should not hide the browse metrics link in the sidebar", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(
        navigationSidebar(page).getByText("Metrics", { exact: true }),
      ).toBeVisible();
    });

    test("should show the empty metrics page", async ({ page }) => {
      await page.goto("/browse/metrics");
      await expect(
        main(page).getByText(EMPTY_STATE_TEXT, { exact: true }),
      ).toBeVisible();
      const createButton = main(page).getByText("Create metric", {
        exact: true,
      });
      await expect(createButton).toBeVisible();
      await createButton.click();
      await expect(page).toHaveURL(/\/metric\/new$/);
    });

    test("should not show the create metric button if the user does not have data access", async ({
      page,
      mb,
    }) => {
      await mb.signInAsSandboxedUser();
      await page.goto("/browse/metrics");
      await expect(
        main(page).getByText(EMPTY_STATE_TEXT, { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Create metric", { exact: true }),
      ).toHaveCount(0);

      // New metric header button should not show either.
      await expect(
        page
          .getByTestId("browse-metrics-header")
          .getByLabel("Create a new metric", { exact: true }),
      ).toHaveCount(0);
    });

    test("user without a collection access should still be able to create and save a metric in his own personal collection", async ({
      page,
      mb,
    }) => {
      await mb.signIn("nocollection" as UserName);
      await page.goto("/browse/metrics");

      await page
        .getByTestId("browse-metrics-header")
        .getByLabel("Create a new metric", { exact: true })
        .click();
      await expect(MetricEditor.queryEditor(page)).toBeVisible();
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("People", { exact: true }).click();

      const createMetric = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );

      await MetricEditor.saveButton(page).click();
      const dialog = modal(page);
      await dialog
        .getByPlaceholder("What is the name of your metric?")
        .fill("My metric");
      await expect(
        dialog.getByText("Save your metric", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText(NOCOLLECTION_PERSONAL_COLLECTION_NAME, { exact: true }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();

      await createMetric;
      await expect(MetricPage.aboutPage(page)).toBeVisible();
      await expect(page).toHaveURL(/\/metric\/\d+/);
    });
  });

  test.describe("multiple metrics", () => {
    test("can browse metrics", async ({ page, mb }) => {
      await createMetrics(mb.api, ALL_METRICS);
      await page.goto("/browse/metrics");
      await expect(
        navigationSidebar(page).getByText("Metrics", { exact: true }),
      ).toBeVisible();

      for (const metric of ALL_METRICS) {
        await expect(findMetric(page, metric.name)).toBeVisible();
      }
    });

    test("should navigate to the metric when clicking a metric title", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
      await page.goto("/browse/metrics");
      const metric = findMetric(page, ORDERS_SCALAR_METRIC.name);
      await expect(metric).toBeVisible();
      await metric.click();
      await expect(page).toHaveURL(/\/metric\//);
      await expect(MetricPage.aboutPage(page)).toBeVisible();
    });

    test("should navigate to that collection when clicking a collection title", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
      await page.goto("/browse/metrics");
      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();

      const collectionLink = metricsTable(page).getByText("Our analytics", {
        exact: true,
      });
      await expect(collectionLink).toBeVisible();
      await collectionLink.click();

      await expect(page).toHaveURL(/\/collection\/root$/);
    });

    test("should open the collections in a new tab when alt-clicking a metric", async ({
      page,
      mb,
    }) => {
      await spyOnWindowOpen(page);

      await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
      await page.goto("/browse/metrics");

      const metric = findMetric(page, ORDERS_SCALAR_METRIC.name);
      await expect(metric).toBeVisible();
      await metric.click({ modifiers: ["ControlOrMeta"] });

      await expect
        .poll(() => getWindowOpenCalls(page))
        .toHaveLength(1);
      const [call] = await getWindowOpenCalls(page);
      expect(call[0]).toMatch(/^\/metric\//);
      expect(call[1]).toBe("_blank");

      // the page did not navigate on this page
      await expect(page).toHaveURL(/\/browse\/metrics$/);
    });

    test("should render truncated markdown in the table", async ({
      page,
      mb,
    }) => {
      const description =
        "This is a _very_ **long description** that should be truncated by the metrics table because it is really very long.";

      await createMetrics(mb.api, [
        {
          ...ORDERS_SCALAR_METRIC,
          description,
        },
      ]);

      await page.goto("/browse/metrics");

      await assertMetricDescriptionEllipsified(page, /This is a/);

      await expect(page.getByText(/should be truncated/)).toHaveCount(2);
    });

    test("should be possible to sort the metrics", async ({ page, mb }) => {
      await createMetrics(
        mb.api,
        ALL_METRICS.slice(0, 4).map((metric, index) => ({
          ...metric,
          name: `Metric ${alphabet[index]}`,
          description: `Description ${alphabet[25 - index]}`,
        })),
      );

      await page.goto("/browse/metrics");

      await expect(getMetricsTableItem(page, 0)).toContainText("Metric A");
      await expect(getMetricsTableItem(page, 1)).toContainText("Metric B");
      await expect(getMetricsTableItem(page, 2)).toContainText("Metric C");
      await expect(getMetricsTableItem(page, 3)).toContainText("Metric D");

      await metricsTable(page).getByText("Description", { exact: true }).click();

      await expect(getMetricsTableItem(page, 0)).toContainText("Metric D");
      await expect(getMetricsTableItem(page, 1)).toContainText("Metric C");
      await expect(getMetricsTableItem(page, 2)).toContainText("Metric B");
      await expect(getMetricsTableItem(page, 3)).toContainText("Metric A");

      await metricsTable(page).getByText("Collection", { exact: true }).click();

      await expect(getMetricsTableItem(page, 0)).toContainText("Metric B");
      await expect(getMetricsTableItem(page, 1)).toContainText("Metric A");
      await expect(getMetricsTableItem(page, 2)).toContainText("Metric C");
      await expect(getMetricsTableItem(page, 3)).toContainText("Metric D");
    });
  });

  test.describe("dot menu", () => {
    test("should be possible to bookmark a metrics from the dot menu", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);

      await page.goto("/browse/metrics");

      await shouldNotHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

      await metricsTable(page).getByLabel("Metric options").click();
      const bookmark = popover(page).getByText("Bookmark", { exact: true });
      await expect(bookmark).toBeVisible();
      await bookmark.click();

      await shouldHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

      await metricsTable(page).getByLabel("Metric options").click();
      const removeBookmark = popover(page).getByText("Remove from bookmarks", {
        exact: true,
      });
      await expect(removeBookmark).toBeVisible();
      await removeBookmark.click();

      await shouldNotHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

      await metricsTable(page).getByLabel("Metric options").click();
      await expect(
        popover(page).getByText("Bookmark", { exact: true }),
      ).toBeVisible();
    });

    test("should be possible to navigate to the collection from the dot menu", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [ORDERS_SCALAR_MODEL_METRIC]);

      await page.goto("/browse/metrics");

      await metricsTable(page).getByLabel("Metric options").click();
      const openCollection = popover(page).getByText("Open collection", {
        exact: true,
      });
      await expect(openCollection).toBeVisible();
      await openCollection.click();

      await expect(page).toHaveURL(
        new RegExp(`/collection/${FIRST_COLLECTION_ID}`),
      );
    });

    test("should be possible to trash a metric from the dot menu when the user has write access", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);

      await page.goto("/browse/metrics");

      await metricsTable(page).getByLabel("Metric options").click();
      const trash = popover(page).getByText("Move to trash", { exact: true });
      await expect(trash).toBeVisible();
      await trash.click();

      await expect(
        main(page).getByText(EMPTY_STATE_TEXT, { exact: true }),
      ).toBeVisible();

      await navigationSidebar(page)
        .getByText("Trash", { exact: true })
        .click();
      // anti-flake guard: the Cypress spec waits on GET /api/bookmark after Restore.
      const bookmark = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/bookmark",
      );
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      const restore = popover(page).getByText("Restore", { exact: true });
      await expect(restore).toBeVisible();
      await restore.click();

      await expect(
        main(page).getByText("Nothing here", { exact: true }),
      ).toBeVisible();
      await bookmark;

      // Restore un-archives the metric, but the search index the browse page
      // reads is still settling; the FE fires one refetch on remount and caches
      // it, so read the backend until it's re-indexed before navigating.
      await waitForMetricSearchable(page, ORDERS_SCALAR_METRIC.name);
      await navigationSidebar(page)
        .getByText("Metrics", { exact: true })
        .click();
      await expect(
        metricsTable(page).getByText(ORDERS_SCALAR_METRIC.name, { exact: true }),
      ).toBeVisible();
    });

    test.describe("when the user does not have write access", () => {
      test("should not be possible to trash a metric from the dot menu when the user does not have write access", async ({
        page,
        mb,
      }) => {
        await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
        await mb.signIn("readonly" as UserName);

        await page.goto("/browse/metrics");

        await metricsTable(page).getByLabel("Metric options").click();
        await expect(
          popover(page).getByText("Move to trash", { exact: true }),
        ).toHaveCount(0);
      });

      test("should be possible to navigate to the collection from the dot menu", async ({
        page,
        mb,
      }) => {
        await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
        await mb.signIn("readonly" as UserName);

        await page.goto("/browse/metrics");

        await metricsTable(page).getByLabel("Metric options").click();
        const openCollection = popover(page).getByText("Open collection", {
          exact: true,
        });
        await expect(openCollection).toBeVisible();
        await openCollection.click();

        await expect(page).toHaveURL(/\/collection\/root$/);
      });

      test("should be possible to bookmark a metrics from the dot menu", async ({
        page,
        mb,
      }) => {
        await createMetrics(mb.api, [ORDERS_SCALAR_METRIC]);
        await mb.signIn("readonly" as UserName);

        await page.goto("/browse/metrics");

        await shouldNotHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

        await metricsTable(page).getByLabel("Metric options").click();
        const bookmark = popover(page).getByText("Bookmark", { exact: true });
        await expect(bookmark).toBeVisible();
        await bookmark.click();

        await shouldHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

        await metricsTable(page).getByLabel("Metric options").click();
        const removeBookmark = popover(page).getByText("Remove from bookmarks", {
          exact: true,
        });
        await expect(removeBookmark).toBeVisible();
        await removeBookmark.click();

        await shouldNotHaveBookmark(page, ORDERS_SCALAR_METRIC.name);

        await metricsTable(page).getByLabel("Metric options").click();
        await expect(
          popover(page).getByText("Bookmark", { exact: true }),
        ).toBeVisible();
      });
    });
  });

  test.describe("verified metrics", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should not show the verified metrics filter when there are no verified metrics", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, ALL_METRICS);
      await page.goto("/browse/metrics");

      await expect(metricsTable(page)).toBeVisible();

      await expect(page.getByLabel(/show.*verified.*metrics/i)).toHaveCount(0);
    });

    test("should show the verified metrics filter when there are verified metrics", async ({
      page,
      mb,
    }) => {
      await createMetrics(mb.api, [
        ORDERS_SCALAR_METRIC,
        ORDERS_SCALAR_MODEL_METRIC,
      ]);
      await page.goto("/browse/metrics");

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        findMetric(page, ORDERS_SCALAR_MODEL_METRIC.name),
      ).toBeVisible();

      await verifyMetric(page, ORDERS_SCALAR_METRIC.name);

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        findMetric(page, ORDERS_SCALAR_MODEL_METRIC.name),
      ).toHaveCount(0);

      const setSettingFalse = waitForVerifiedSetting(page, false);
      await toggleVerifiedMetricsFilter(page);
      await setSettingFalse;

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        findMetric(page, ORDERS_SCALAR_MODEL_METRIC.name),
      ).toBeVisible();

      const setSettingTrue = waitForVerifiedSetting(page, true);
      await toggleVerifiedMetricsFilter(page);
      await setSettingTrue;

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        findMetric(page, ORDERS_SCALAR_MODEL_METRIC.name),
      ).toHaveCount(0);

      await unverifyMetric(page, ORDERS_SCALAR_METRIC.name);

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        findMetric(page, ORDERS_SCALAR_MODEL_METRIC.name),
      ).toBeVisible();
    });

    test("should respect the user setting on whether to only show verified metrics", async ({
      page,
      mb,
    }) => {
      await forceVerifiedMetricsSessionProperty(page, true);

      await createMetrics(mb.api, [
        ORDERS_SCALAR_METRIC,
        ORDERS_SCALAR_MODEL_METRIC,
      ]);
      await page.goto("/browse/metrics");
      await verifyMetric(page, ORDERS_SCALAR_METRIC.name);

      await expect(findMetric(page, ORDERS_SCALAR_METRIC.name)).toBeVisible();
      await expect(
        page.getByRole("switch", { name: /show.*verified.*metrics/i }),
      ).toHaveAttribute("aria-selected", "true");

      // Upstream's second intercept literally sets the property `true` again yet
      // asserts `aria-selected=false`; Cypress only "passes" by catching the
      // switch's initial-render transient (default false before the forced-true
      // setting hydrates). Playwright's toHaveAttribute retry catches that
      // transient only when slow, so a literal port is flaky. The test's intent
      // (and its assertion) is that a *false* user setting turns the switch off,
      // so drive that value deterministically — matching the Cypress-verified
      // outcome without depending on a render race.
      await forceVerifiedMetricsSessionProperty(page, false);

      await page.goto("/browse/metrics");
      await expect(
        page.getByRole("switch", { name: /show.*verified.*metrics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });
  });
});

/** Port of the spec-local createMetrics: metrics.forEach(H.createQuestion). */
async function createMetrics(
  api: Parameters<typeof createQuestion>[0],
  metrics: StructuredQuestionDetailsWithName[],
) {
  for (const metric of metrics) {
    await createQuestion(api, metric);
  }
}

/**
 * Port of the `cy.intercept("PUT", "/api/setting/browse-filter-only-verified-metrics")`
 * assertion `xhr.request.body deep.equal { value }`: resolve on the PUT and
 * assert its request body. Register before the toggling action (PORTING rule 2).
 */
function waitForVerifiedSetting(page: Page, value: boolean) {
  return page.waitForResponse(async (response) => {
    if (
      response.request().method() !== "PUT" ||
      new URL(response.url()).pathname !==
        "/api/setting/browse-filter-only-verified-metrics"
    ) {
      return false;
    }
    const body = response.request().postDataJSON();
    return body?.value === value;
  });
}
