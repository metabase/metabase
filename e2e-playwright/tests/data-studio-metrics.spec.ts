/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-studio-metrics.cy.spec.ts
 *
 * Data Studio > library > metrics: create a metric from the library, edit and
 * cancel its definition, the unsaved-changes guard, archive/restore,
 * explore/duplicate/move from the more menu, the metric-creation analytics
 * events from browse-metrics and the command palette, and the per-metric
 * caching strategy.
 *
 * Port notes:
 * - **Snowplow is captured, not stubbed.** PORTING rule 6's no-op stub applies
 *   only where snowplow is incidental; here the `analytics events` describe
 *   asserts nothing else, so stubbing would port those two tests as no-ops.
 *   `installSnowplowCapture` (support/search-snowplow.ts) records the tracker's
 *   real POST body at the browser boundary — no micro container, no cross-slot
 *   contention. All four snowplow assertions in this file (2 in the create
 *   test, 3 across the analytics describe) are real.
 * - The library is EE-gated; upstream needs `pro-cloud` specifically (its
 *   comment: the self-hosted "No notification channels" banner pushes the run
 *   button out of reach). The whole describe skips without it (rule 7).
 * - `cy.intercept(...).as()` + `cy.wait()` → `waitForResponse` registered
 *   BEFORE the trigger (rule 2). The `@createCollection` / `@updateCollection`
 *   intercepts are never awaited upstream and are dropped.
 * - The metric title is an EditableText: `fill()` does not mark it dirty, so
 *   the rename goes through real keystrokes (`renameMetricTitle`) and is
 *   anchored on the PUT.
 * - `cy.url().should("match", …)` → `expect.poll` (a one-shot check catches
 *   transient states).
 * - `findByDisplayValue` must scan `textarea` too — the metric title renders as
 *   one; the shared `filters-repros.findByDisplayValue` does that.
 *
 * Dividends: none. Every upstream assertion here is a real assertion; nothing
 * was found vacuous. See findings-inbox/data-studio-metrics.md.
 */
import { resolveToken } from "../support/api";
import { echartsContainer } from "../support/charts";
import { openCommandPalette } from "../support/command-palette";
import { pickEntity, selectDropdown } from "../support/dashboard";
import {
  createLibraryWithItems,
  dataStudioNav,
  libraryNewButton,
  metricMoreMenu,
  visitLibrary,
} from "../support/data-studio-library";
import {
  MetricDetail,
  visitMetricPage,
  waitForCreateCard,
  waitForUpdateCacheConfig,
  waitForUpdateCard,
  renameMetricTitle,
} from "../support/data-studio-metrics";
import {
  DependencyGraph,
  waitForBackfillComplete,
} from "../support/dependency-graph";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { MetricPage } from "../support/metrics";
import { MetricEditor, runButtonInOverlay } from "../support/metrics-editing";
import { entityPickerModal, getNotebookStep } from "../support/notebook";
import {
  commandPaletteSearch,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import { modal, popover } from "../support/ui";

const hasToken = Boolean(resolveToken("pro-cloud"));

test.describe("scenarios > data studio > library > metrics", () => {
  test.skip(!hasToken, "requires the pro-cloud EE token (library)");

  let snowplow: SnowplowCapture;
  let trustedMetricId: number;
  let metricsCollectionId: number | undefined;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    // H.resetSnowplow() — the capture starts empty; installed before the first
    // navigation because the tracker is created during app bootstrap.
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
    await mb.signInAsAdmin();
    // Needs cloud because the "No notification channels" banner takes up too
    // much space and the run button is not clickable.
    await mb.api.activateToken("pro-cloud");

    ({ trustedMetricId, metricsCollectionId } = await createLibraryWithItems(
      mb.api,
    ));
  });

  test("should create a new metric with proper validation and save to collection", async ({
    page,
    mb,
  }) => {
    await visitLibrary(page);

    // Create a new metric
    await libraryNewButton(page).click();
    await popover(page).getByText("Metric", { exact: true }).click();

    // Verify metric_create_started event was tracked
    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "metric_create_started",
      triggered_from: "data_studio_library",
    });

    await expect(MetricEditor.queryEditor(page)).toBeVisible();
    await expect(MetricEditor.saveButton(page)).toBeDisabled();

    await miniPickerBrowseAll(page).click();
    await expect(entityPickerModal(page)).toBeVisible();
    await pickEntity(page, {
      path: ["Databases", /Sample Database/, "Orders"],
    });

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    await popover(page).getByText("Created At", { exact: true }).click();

    await expect(MetricEditor.saveButton(page)).toBeEnabled();
    await MetricEditor.saveButton(page).click();

    const saveModal = modal(page);
    await expect(
      saveModal.getByText("Save your metric", { exact: true }),
    ).toBeVisible();
    await saveModal.getByLabel("Name", { exact: true }).fill("Total Revenue");
    await saveModal
      .getByLabel("Description", { exact: true })
      .fill("Sum of all order totals across the store");
    await expect(
      saveModal.getByText("Where do you want to save this?", { exact: true }),
    ).toBeVisible();

    const createCard = waitForCreateCard(page);
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    await createCard;

    // Verify metric_created event was tracked
    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "metric_created",
      triggered_from: "data_studio",
      result: "success",
    });

    // Verify metric overview page
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/data-studio\/library\/metrics\/\d+$/);

    // breadcrumbs + header
    await expect(
      MetricPage.aboutPage(page).getByText("Total Revenue", { exact: true }),
    ).toHaveCount(2);
    await expect(
      MetricPage.aboutPage(page).getByText(
        "Sum of all order totals across the store",
        { exact: true },
      ),
    ).toBeVisible();

    const sidebar = MetricDetail.aboutPageDescriptionSidebar(page);
    await expect(sidebar.getByText(/^Last updated/)).toBeVisible();

    await expect(sidebar.getByText("Source", { exact: true })).toBeVisible();
    await expect(
      sidebar.getByText("Sample Database", { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Orders", { exact: true })).toBeVisible();

    await expect(
      sidebar.getByText("Relationships", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("No dependencies", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("No charts use this metric", { exact: true }),
    ).toBeVisible();

    // Ensure chart is visible
    await expect(
      echartsContainer(page).getByText("Count", { exact: true }),
    ).toBeVisible();

    // Verify metric definition page
    await MetricDetail.definitionTab(page).click();

    // Verify notebook state
    await expect(MetricEditor.queryEditor(page)).toBeVisible();
    await expect(
      getNotebookStep(page, "data").getByText("Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      getNotebookStep(page, "summarize").getByText("Created At: Month", {
        exact: true,
      }),
    ).toBeVisible();

    await runButtonInOverlay(page).click();
    // Ensure chart is visible
    await expect(
      echartsContainer(page).getByText("Count", { exact: true }),
    ).toBeVisible();

    // Verify metric dependencies page
    await waitForBackfillComplete(mb.api);
    await page.reload();
    await MetricDetail.dependenciesTab(page).click();
    await expect(
      DependencyGraph.graph(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      DependencyGraph.graph(page).getByText("Total Revenue", { exact: true }),
    ).toBeVisible();
  });

  test("should edit metric definition and save changes", async ({
    page,
    mb,
  }) => {
    await visitMetricPage(page, trustedMetricId);

    // Verify metric overview page displays correct data
    const title = await findByDisplayValue(
      MetricPage.aboutPage(page),
      "Trusted Orders Metric",
    );
    await expect(title).toBeVisible();

    // Update the metric name
    await renameMetricTitle(page, title, "Updated Orders Metric");

    // Verify updated name appears in overview
    await expect(
      await findByDisplayValue(
        MetricPage.aboutPage(page),
        "Updated Orders Metric",
      ),
    ).toBeVisible();

    // Verify the new name persisted
    const card = (await (
      await mb.api.get(`/api/card/${trustedMetricId}`)
    ).json()) as { name: string };
    expect(card.name).toBe("Updated Orders Metric");
  });

  test("should cancel editing and revert changes", async ({ page }) => {
    await visitMetricPage(page, trustedMetricId);

    // Navigate to definition tab
    await MetricDetail.definitionTab(page).click();

    // Change aggregation
    await getNotebookStep(page, "summarize")
      .getByText("Count", { exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();

    // Verify save button is enabled, then cancel
    await expect(MetricEditor.saveButton(page)).toBeEnabled();
    await MetricEditor.cancelButton(page).click();

    // Verify changes were reverted
    await expect(
      getNotebookStep(page, "summarize").getByText("Count", { exact: true }),
    ).toBeVisible();
  });

  test("should show unsaved changes warning when navigating away", async ({
    page,
  }) => {
    await visitMetricPage(page, trustedMetricId);

    // Navigate to definition tab
    await MetricDetail.definitionTab(page).click();

    // Change aggregation from Count to Sum
    await expect(MetricEditor.queryEditor(page)).toBeVisible();
    await getNotebookStep(page, "summarize")
      .getByText("Count", { exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();

    // Try to navigate away
    await dataStudioNav(page)
      .getByRole("link", { name: "Glossary", exact: true })
      .click();

    // Verify unsaved changes modal appears
    await expect(
      modal(page).getByText("Discard your changes?", { exact: true }),
    ).toBeVisible();
    await modal(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    // Verify we're still on the definition tab
    await expect(MetricEditor.queryEditor(page)).toBeVisible();
  });

  test("should archive and restore a metric", async ({ page, mb }) => {
    await visitMetricPage(page, trustedMetricId);

    // Verify metric is loaded before archiving
    await expect(
      await findByDisplayValue(
        MetricPage.aboutPage(page),
        "Trusted Orders Metric",
      ),
    ).toBeVisible();

    // Archive the metric
    await metricMoreMenu(page).click();
    await popover(page).getByText("Move to trash", { exact: true }).click();

    // Confirm archiving in modal
    const archive = waitForUpdateCard(page);
    await modal(page)
      .getByRole("button", { name: "Move to trash", exact: true })
      .click();
    await archive;

    // Verify redirected to the library
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toContain("/data-studio/library");

    // Verify the metric is archived
    const archived = (await (
      await mb.api.get(`/api/card/${trustedMetricId}`)
    ).json()) as { archived: boolean };
    expect(archived.archived).toBe(true);

    // Navigate to trash
    await page.goto("/trash");

    // Verify metric appears in trash
    await expect(
      page
        .getByRole("table")
        .getByText("Trusted Orders Metric", { exact: true }),
    ).toBeVisible();

    // Restore the metric
    await page
      .getByRole("table")
      .getByText("Trusted Orders Metric", { exact: true })
      .click();
    await expect(page.getByTestId("archive-banner")).toBeVisible();
    const restore = waitForUpdateCard(page);
    await page
      .getByTestId("archive-banner")
      .getByText("Restore", { exact: true })
      .click();
    await restore;

    // Verify the metric is restored
    const restored = (await (
      await mb.api.get(`/api/card/${trustedMetricId}`)
    ).json()) as { archived: boolean };
    expect(restored.archived).toBe(false);
  });

  test("should view metric in the metrics explorer view via the Explore button", async ({
    page,
  }) => {
    await visitMetricPage(page, trustedMetricId);

    // Verify metric is loaded
    await expect(
      await findByDisplayValue(
        MetricPage.aboutPage(page),
        "Trusted Orders Metric",
      ),
    ).toBeVisible();

    // Verify the Explore button points to the metrics explorer
    await expect(MetricDetail.exploreLink(page)).toHaveAttribute(
      "href",
      /\/explore\?metricId=\d+/,
    );
  });

  test("should duplicate metric via more menu", async ({ page, mb }) => {
    await visitMetricPage(page, trustedMetricId);

    // Verify metric is loaded
    await expect(
      await findByDisplayValue(
        MetricPage.aboutPage(page),
        "Trusted Orders Metric",
      ),
    ).toBeVisible();

    // Open more menu and click Duplicate
    await metricMoreMenu(page).click();
    await popover(page).getByText("Duplicate", { exact: true }).click();

    // Save duplicate metric
    await expect(
      modal(page).getByText('Duplicate "Trusted Orders Metric"', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(modal(page).getByLabel("Name", { exact: true })).toHaveValue(
      "Trusted Orders Metric - Duplicate",
    );
    await modal(page)
      .getByTestId("dashboard-and-collection-picker-button")
      .click();

    await entityPickerModal(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByText("Library", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByText("Metrics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select this collection", exact: true })
      .click();

    // The copy goes through POST /api/card (CardCopyModal uses
    // useCreateCardMutation), not /api/card/:id/copy.
    const createCard = waitForCreateCard(page);
    await modal(page)
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await createCard;
    await expect(modal(page)).toHaveCount(0);

    // Verify duplicate metric is created — breadcrumbs + header
    await expect(
      MetricPage.aboutPage(page).getByText("Trusted Orders Metric - Duplicate", {
        exact: true,
      }),
    ).toHaveCount(2);

    // Verify both metrics live in the Metrics collection
    const items = (await (
      await mb.api.get(`/api/collection/${metricsCollectionId}/items`)
    ).json()) as { data: { name: string }[] };
    const names = items.data.map((item) => item.name);
    expect(names).toContain("Trusted Orders Metric");
    expect(names).toContain("Trusted Orders Metric - Duplicate");
  });

  test("should move metric to different collection via more menu", async ({
    page,
    mb,
  }) => {
    await visitMetricPage(page, trustedMetricId);

    // Verify metric is loaded
    await expect(
      await findByDisplayValue(
        MetricPage.aboutPage(page),
        "Trusted Orders Metric",
      ),
    ).toBeVisible();

    // Open more menu and click Move
    await metricMoreMenu(page).click();
    await popover(page).getByText("Move", { exact: true }).click();

    // Select First collection as destination
    const move = waitForUpdateCard(page);
    await pickEntity(page, {
      path: ["Our analytics", "First collection"],
      select: true,
    });
    await move;

    // Verify metric is in First collection
    await page
      .getByTestId("move-card-toast")
      .getByText("First collection", { exact: true })
      .click();

    // Verify the metric left the Metrics collection
    const card = (await (
      await mb.api.get(`/api/card/${trustedMetricId}`)
    ).json()) as { collection_id: number };
    expect(card.collection_id).not.toBe(metricsCollectionId);
  });

  test.describe("analytics events", () => {
    test("should track metric_create_started and metric_created from browse metrics", async ({
      page,
    }) => {
      await page.goto("/browse/metrics");

      // Click the plus button to create a new metric
      await page
        .getByRole("link", { name: "Create a new metric", exact: true })
        .click();

      // Verify metric_create_started event was tracked
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "metric_create_started",
        triggered_from: "browse_metrics",
      });

      // Verify we're on the new metric page
      await expect.poll(() => new URL(page.url()).pathname).toMatch(
        /\/metric\/new/,
      );

      const search = page.getByPlaceholder(/Search for tables/);
      // The mini picker opens on the input's click handler; pressSequentially
      // focuses but never clicks (batch-12 gotcha).
      await search.click();
      await search.pressSequentially("Orders");

      const orders = popover(page).getByRole("menuitem", { name: /Orders/ });
      // locator.count() does not retry — gate on visibility first.
      await expect(orders.first()).toBeVisible();
      expect(await orders.count()).toBeGreaterThanOrEqual(1);
      await orders.first().click();

      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save", exact: true })
        .click();

      // Verify metric_created event was tracked
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "metric_created",
      });
    });

    test("should track metric_create_started from command palette", async ({
      page,
    }) => {
      await page.goto("/");

      // Open command palette and create metric
      await openCommandPalette(page);
      await commandPaletteSearch(page, "metric", false);
      await page.getByRole("option", { name: /New metric/ }).click();

      // Verify metric_create_started event was tracked
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "metric_create_started",
        triggered_from: "command_palette",
      });

      // Verify we're on the new metric page
      await expect.poll(() => new URL(page.url()).pathname).toMatch(
        /\/metric\/new/,
      );
    });
  });

  test.describe("caching", () => {
    test("should allow changing metric caching settings", async ({ page }) => {
      await visitMetricPage(page, trustedMetricId);

      // Open the caching settings from the overflow menu
      await metricMoreMenu(page).click();
      await popover(page).getByText("Caching", { exact: true }).click();

      // Change the strategy to Duration and save
      const strategySelect = modal(page).getByTestId("cache-strategy-select");
      await expect(strategySelect).toHaveValue("Default");
      await strategySelect.click();
      // The Select dropdown renders in a portal; wait for it to open, then pick.
      await selectDropdown(page)
        .getByRole("option", { name: /Duration/ })
        .click();

      const updateCache = waitForUpdateCacheConfig(page);
      await modal(page).getByTestId("strategy-form-submit-button").click();
      await updateCache;

      // Saving persists the change and closes the modal
      await expect(modal(page)).toHaveCount(0);

      // Re-open the caching settings to verify the change is persisted
      await metricMoreMenu(page).click();
      await popover(page).getByText("Caching", { exact: true }).click();
      await expect(modal(page).getByTestId("cache-strategy-select")).toHaveValue(
        "Duration",
      );
    });
  });
});
