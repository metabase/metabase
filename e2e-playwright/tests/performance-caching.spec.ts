/**
 * Playwright port of
 * e2e/test/scenarios/admin/performance/caching.cy.spec.ts
 *
 * Admin > Performance / caching smoke tests: the default (root) cache strategy
 * on OSS, and — behind the EE `pro-self-hosted` token — per-database and
 * per-question cache overrides, cache invalidation, the preemptive-caching
 * switch round-tripping through the question sidebar and the admin tab, the
 * dirty-form guard's four close paths, and per-row form initialization on the
 * admin tab.
 *
 * Notes:
 * - The `oss` describe mirrors the upstream @OSS describe: no conditional skip.
 *   It exercises the default caching strategy, which exists on OSS *and* EE
 *   (the EE describe adds the per-item overrides). No token is activated there,
 *   so on the jar (EE backend) it behaves exactly like OSS.
 * - The `ee` describe is gated on the pro-self-hosted token (the jar activates
 *   it). Skips when the token env var is absent.
 * - Cache/config intercepts (rule 2): waitForResponse registered before the
 *   triggering action, awaited after. saveCacheStrategyForm waits the PUT
 *   /api/cache; openSidebarCacheStrategyForm waits the GET /api/cache?model&id.
 * - Mantine Switch toggled by force-clicking the role="switch" input, not the
 *   label (rule 4).
 * - Before the keyboard Escape close-path, the mouse is parked away so a
 *   tooltip under the parked cursor can't eat the Escape (wave-9 gotcha).
 * - New helpers live in support/performance-caching.ts (import-only from the
 *   shared modules).
 */
import {
  ORDERS_COUNT_QUESTION_ID,
  cacheStrategySelect,
  cacheStrategySidesheet,
  cancelConfirmationModal,
  openSidebarCacheStrategyForm,
  preemptiveCachingSwitch,
  preemptiveCachingSwitchInput,
  saveCacheStrategyForm,
  selectCacheStrategy,
} from "../support/performance-caching";
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { visitQuestion } from "../support/ui";

test.describe("scenarios > admin > performance > caching", () => {
  test.describe("oss", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("saves the default-policy strategy and reflects the saved state", async ({
      page,
    }) => {
      await page.goto("/admin/performance");
      await selectCacheStrategy(page, /Adaptive/);
      await saveCacheStrategyForm(page);
      await expect(cacheStrategySelect(page)).toHaveValue("Adaptive");
    });
  });

  test.describe("ee", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "EE caching strategies require the pro-self-hosted token",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("can configure a database cache strategy, save, and clear the cache", async ({
      page,
    }) => {
      await page.goto("/admin/performance");
      await page
        .getByTestId("admin-layout-content")
        .getByLabel(/Edit.*Sample Database.*currently.*No caching/)
        .click();

      // Clear-cache button is absent before the database has a cache
      await expect(
        page.getByRole("button", { name: /Clear cache/ }),
      ).toHaveCount(0);

      // Set Sample Database to Duration and save
      await selectCacheStrategy(page, /Duration/);
      await saveCacheStrategyForm(page);
      await expect(
        page
          .getByTestId("admin-layout-content")
          .getByLabel(/Edit.*Sample Database.*currently.*Duration/),
      ).toBeVisible();

      const invalidateCacheForSampleDatabase = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "POST" &&
            url.pathname === "/api/cache/invalidate" &&
            url.searchParams.get("include") === "overrides" &&
            url.searchParams.has("database")
          );
        },
      );

      // Clear-cache button is now visible — click it
      await page
        .getByRole("button", { name: /Clear cache for this database/ })
        .click();

      // Confirm in the dialog
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Clear cache/ })
        .click();
      await invalidateCacheForSampleDatabase;

      await expect(
        page.getByRole("button", { name: /Cache cleared/ }),
      ).toBeVisible();
    });

    test("preemptive caching toggles persist across the question sidebar and the admin tab", async ({
      page,
    }) => {
      // Enable preemptive caching from the question sidebar
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openSidebarCacheStrategyForm(page, "question");
      await selectCacheStrategy(page, /Duration/);
      {
        const input = preemptiveCachingSwitchInput(page);
        await expect(input).not.toBeChecked();
        await input.click({ force: true });
        await expect(input).toBeChecked();
      }

      // After saving, the form reloads its config; wait for that reload before
      // re-opening so the assertion doesn't race a stale (pre-save) render.
      const reloadCacheConfig = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/cache" &&
          url.searchParams.has("model") &&
          url.searchParams.has("id")
        );
      });
      await saveCacheStrategyForm(page);
      await reloadCacheConfig;
      await page.getByLabel("When to get new results", { exact: true }).click();
      await expect(preemptiveCachingSwitchInput(page)).toBeChecked();

      // Toggle is reflected on the admin Dashboard and question caching tab
      await page.goto("/admin/performance/dashboards-and-questions");
      await page
        .getByTestId("cache-config-table")
        .getByText(/Duration: 24h/)
        .first()
        .click();
      await expect(preemptiveCachingSwitchInput(page)).toBeChecked();

      // Disable from the admin tab
      {
        const input = preemptiveCachingSwitchInput(page);
        await expect(input).toBeChecked();
        await input.click({ force: true });
        await expect(input).not.toBeChecked();
      }
      await saveCacheStrategyForm(page);
      await expect(preemptiveCachingSwitchInput(page)).not.toBeChecked();

      // Toggle is reflected back in the question sidebar
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openSidebarCacheStrategyForm(page, "question");
      await expect(preemptiveCachingSwitchInput(page)).not.toBeChecked();
    });

    /**
     * The dirty-form modal guards four independent close paths, each backed by
     * a different listener (Mantine close button, keyboard ESC handler,
     * outside-click detector, react-router history listener). This test
     * exercises all four against the question sidebar's cache strategy form.
     */
    test("guards closing a dirty cache form across all four close paths", async ({
      page,
    }) => {
      // Populate browser history so goBack() has somewhere to go
      await page.goto("/");
      await page
        .getByTestId("main-navbar-root")
        .getByText("Our analytics", { exact: true })
        .click();
      await page
        .getByTestId("collection-table")
        .getByText("Orders", { exact: true })
        .click();

      const sidesheet = await openSidebarCacheStrategyForm(page, "question");
      await expect(sidesheet.getByText(/Caching settings/)).toBeVisible();
      await selectCacheStrategy(page, /Duration/);

      // Action 1 — click the close (×) button
      await cacheStrategySidesheet(page)
        .getByRole("button", { name: /Close/ })
        .click();
      await cancelConfirmationModal(page);

      // Action 2 — press ESC (park the mouse first so no tooltip eats it)
      await page.mouse.move(0, 0);
      await page.keyboard.press("Escape");
      await cancelConfirmationModal(page);

      // Action 3 — click outside (modal overlay)
      const overlays = page.getByTestId("modal-overlay");
      expect(await overlays.count()).toBeGreaterThanOrEqual(1);
      await overlays.last().click();
      await cancelConfirmationModal(page);

      // Action 4 — browser back button
      await page.goBack();
      await cancelConfirmationModal(page);
    });

    /**
     * When the admin tab has multiple cache-config rows, clicking each must
     * open the form initialized from that row's config — not a stale shared
     * state, not the first row regardless of which was clicked.
     */
    test("opens the right form when clicking distinct entries on the admin tab", async ({
      page,
    }) => {
      // Configure Orders with Duration: 99h
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openSidebarCacheStrategyForm(page, "question");
      await selectCacheStrategy(page, /Duration/);
      await page.getByLabel(/Cache duration/).fill("99");
      await saveCacheStrategyForm(page);

      // Configure Orders, Count with Adaptive
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await openSidebarCacheStrategyForm(page, "question");
      await selectCacheStrategy(page, /Adaptive/);
      await saveCacheStrategyForm(page);

      // Both entries are visible on the admin tab
      await page.goto("/admin/performance/dashboards-and-questions");
      const table = page.getByTestId("cache-config-table");
      await expect(table).toContainText("Duration: 99h");
      await expect(table).toContainText("Adaptive");

      // Clicking Duration: 99h opens its form with duration selected
      await table
        .getByText(/Duration: 99h/)
        .first()
        .click();
      await expect(cacheStrategySelect(page)).toHaveValue("Duration");
      await expect(page.getByLabel(/Cache duration/)).toHaveValue("99");

      // Close the sidesheet via ESC
      await page.mouse.move(0, 0);
      await page.keyboard.press("Escape");

      // Clicking Adaptive opens its form with adaptive selected
      await table
        .getByText(/Adaptive/)
        .first()
        .click();
      await expect(cacheStrategySelect(page)).toHaveValue("Adaptive");
    });
  });
});
