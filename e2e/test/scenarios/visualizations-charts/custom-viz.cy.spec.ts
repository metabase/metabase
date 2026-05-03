import { SAMPLE_DB_TABLES, USER_GROUPS } from "e2e/support/cypress_data";
import {
  type DashboardDetails,
  type StructuredQuestionDetails,
  adminAppLinkText,
  mainAppLinkText,
} from "e2e/support/helpers";
import { checkNotNull } from "metabase/utils/types";
import type {
  CardId,
  CustomVizPlugin,
  DashboardId,
  DocumentContent,
  Parameter,
} from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP } = USER_GROUPS;
const AGGREGATED_VALUE = "18760";
const AGGREGATED_VALUE_FORMATTED = "18,760";

function buildDocumentWithCustomVizCard(cardId: CardId): DocumentContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { _id: "1" },
        content: [{ type: "text", text: "Custom viz embedded below:" }],
      },
      {
        type: "resizeNode",
        attrs: { height: 400, minHeight: 280 },
        content: [
          {
            type: "cardEmbed",
            attrs: { id: cardId, name: null, _id: "2" },
          },
        ],
      },
      { type: "paragraph", attrs: { _id: "3" } },
    ],
  };
}

describe("admin > custom visualizations", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
  });

  describe("feature gating", () => {
    describe("EE", () => {
      it("should show upsell when feature is locked", () => {
        // No token activation — feature is locked
        H.visitCustomVizSettings();

        cy.findByRole("heading", {
          name: /Build your own visualizations/,
        }).should("be.visible");
        H.getAddVisualizationLink().should("not.exist");
      });

      it("should enable and disable custom visualizations", () => {
        H.activateToken("bleeding-edge");

        H.visitCustomVizSettings();

        H.main()
          .findByRole("button", { name: /Enable custom visualizations/ })
          .should("be.visible")
          .click();

        H.getAddVisualizationLink().should("be.visible");

        H.main()
          .findByRole("button", { name: /More options/ })
          .click();
        H.popover().findByText("Deactivate custom visualizations").click();

        H.main()
          .findByRole("heading", { name: "Add a new visualization" })
          .should("not.exist");
        H.main()
          .findByRole("heading", { name: "Enable custom visualizations" })
          .should("be.visible");
      });

      it('should not show custom visualizations page to non-admins with "Settings access" permission', () => {
        H.activateToken("bleeding-edge");
        H.updateAdvancedPermissionsGraph({
          [ALL_USERS_GROUP]: { setting: "yes" },
        });
        cy.signInAsNormalUser();

        cy.visit("/admin/settings/custom-visualizations");
        H.main().should(
          "include.text",
          "Sorry, you don’t have permission to see that.",
        );

        H.goToAdmin();
        cy.findByTestId("admin-layout-sidebar")
          .findByText("Custom visualizations")
          .should("not.exist");
      });

      it("should not show nested sidebar navigation when custom viz plugin dev mode is disabled", () => {
        cy.intercept("GET", "/api/session/properties", (req) => {
          req.continue((res) => {
            res.body["custom-viz-plugin-dev-mode-enabled"] = false;
          });
        });

        H.activateToken("bleeding-edge");
        H.setupCustomVizRepo();
        H.updateSetting("custom-viz-enabled", true);
        H.visitCustomVizSettings();
        H.getAddVisualizationLink().click();

        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Development/ })
          .should("not.exist");
        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Manage visualizations/ })
          .should("not.exist");
        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Custom visualizations/ })
          .should("have.attr", "data-active", "true");

        cy.findByLabelText(/Repository URL/).type(H.CUSTOM_VIZ_REPO_URL);
        cy.findByRole("button", { name: "Add visualization" }).click();
        cy.findByRole("link", { name: /demo-viz/ }).click();

        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Custom visualizations/ })
          .should("have.attr", "data-active", "true");
      });
    });

    describe("OSS", { tags: "@OSS" }, () => {
      it("should show upsell when feature is locked", () => {
        H.visitCustomVizSettings();

        cy.findByRole("heading", {
          name: /Build your own visualizations/,
        }).should("be.visible");
        cy.findByRole("link", { name: "Try for free" }).should("be.visible");
        H.getAddVisualizationLink().should("not.exist");
      });
    });
  });

  describe("admin settings page", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
    });

    it("should add a plugin via the form and show it in the list", () => {
      H.resetSnowplow();
      H.enableTracking();
      H.visitCustomVizSettings();

      H.getAddVisualizationLink().click();

      cy.log("Submit is disabled until a file is selected");
      cy.findByRole("button", { name: "Add visualization" }).should(
        "be.disabled",
      );

      H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ);
      cy.findByRole("button", { name: "Add visualization" }).should(
        "be.enabled",
      );

      H.interceptPluginCreate();
      cy.findByRole("button", { name: "Add visualization" }).click();
      cy.wait("@pluginCreate");

      cy.log("Should redirect to the list and show the plugin");
      H.main().findByText("demo-viz").should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "custom_viz_plugin_created",
        result: "success",
      });
      H.expectNoBadSnowplowEvents();
    });

    it("should display manifest information and bundle hash after upload", () => {
      H.setupCustomVizPlugin();
      H.visitCustomVizSettings();
      H.getCustomVizPluginIcon("demo-viz").should("be.visible");
      H.main().findByText("demo-viz").should("be.visible");

      cy.log(
        "Bundle hash chip is the first 8 chars of the fixture's deterministic SHA-256",
      );
      H.main()
        .findByText(`Bundle: ${H.CUSTOM_VIZ_FIXTURE_BUNDLE_HASH.slice(0, 8)}`)
        .should("be.visible");

      H.main()
        .findByText(/^Requires Metabase /)
        .should("be.visible");
    });

    it("should surface an inline error for an invalid bundle", () => {
      H.visitCustomVizNewForm();

      cy.findByRole("link", { name: /Manage visualizations/ }).should(
        "have.attr",
        "data-active",
        "true",
      );

      cy.log("Upload a non-tar.gz file so the BE rejects it.");
      H.dropCustomVizBundle({
        contents: Cypress.Buffer.from("not a tarball"),
        fileName: "broken.tgz",
        mimeType: "application/gzip",
      });

      cy.intercept("POST", "/api/ee/custom-viz-plugin").as(
        "pluginCreateInvalid",
      );
      cy.findByRole("button", { name: "Add visualization" }).click();

      cy.wait("@pluginCreateInvalid")
        .its("response.statusCode")
        .should("eq", 400);

      cy.log("Error is surfaced inline in the form");
      cy.findByTestId("custom-viz-settings-form").within(() => {
        cy.findByText(/Bundle is not a valid tar\.gz archive/).should(
          "be.visible",
        );
      });

      cy.location("pathname").should(
        "eq",
        "/admin/settings/custom-visualizations/new",
      );
    });

    it("should support multiple plugins", () => {
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_2);
      H.visitCustomVizSettings();

      H.main().findByText("demo-viz").should("be.visible");
      H.main().findByText("demo-viz-2").should("be.visible");

      // Both plugins should be available in chart type selector
      H.openOrdersTable({ limit: 1 });
      cy.findByTestId("viz-type-button").click();
      H.main().findByText("Custom visualizations").should("be.visible").click();
      H.main().findByText("demo-viz").should("be.visible");
      H.main().findByText("demo-viz-2").should("be.visible");
    });

    describe("with an installed plugin", () => {
      beforeEach(() => {
        H.setupCustomVizPlugin();
        H.visitCustomVizSettings();
      });

      it("should display plugin details in the list", () => {
        H.main().findByText("demo-viz").should("be.visible");
        H.main()
          .findByText(`Bundle: ${H.CUSTOM_VIZ_FIXTURE_BUNDLE_HASH.slice(0, 8)}`)
          .should("be.visible");
      });
    });

    describe("updating a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("should replace the bundle via the edit form", () => {
        H.resetSnowplow();
        H.enableTracking();
        H.setupCustomVizPlugin().then((plugin: CustomVizPlugin) => {
          H.visitCustomVizEditForm(plugin.id);

          cy.findByRole("heading", { name: "Replace bundle" }).should(
            "be.visible",
          );

          H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ);

          cy.intercept(
            "PUT",
            `/api/ee/custom-viz-plugin/${plugin.id}/bundle`,
          ).as("pluginBundleReplace");
          cy.findByRole("button", { name: /Replace$/ }).click();

          cy.wait("@pluginBundleReplace")
            .its("response.statusCode")
            .should("eq", 200);

          cy.log("Should redirect back to the list page");
          cy.location("pathname").should(
            "eq",
            "/admin/settings/custom-visualizations",
          );
          H.main().findByText("demo-viz").should("be.visible");
          H.expectUnstructuredSnowplowEvent({
            event: "custom_viz_plugin_updated",
            result: "success",
          });
          H.expectNoBadSnowplowEvents();
        });
      });

      it("should surface an inline error when replacing with a non-matching bundle", () => {
        H.setupCustomVizPlugin().then((plugin: CustomVizPlugin) => {
          H.visitCustomVizEditForm(plugin.id);

          cy.findByRole("link", { name: /Manage visualizations/ }).should(
            "have.attr",
            "data-active",
            "true",
          );

          cy.log(
            'The 2nd fixture has manifest.name = "demo-viz-2" — BE rejects because it does not match the existing identifier',
          );
          H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ_2);

          cy.intercept(
            "PUT",
            `/api/ee/custom-viz-plugin/${plugin.id}/bundle`,
          ).as("pluginBundleReplaceInvalid");
          cy.findByRole("button", { name: /Replace$/ }).click();

          cy.wait("@pluginBundleReplaceInvalid")
            .its("response.statusCode")
            .should("eq", 400);

          cy.findByTestId("custom-viz-settings-form").within(() => {
            cy.findByText(/does not match the plugin's identifier/).should(
              "be.visible",
            );
          });

          cy.location("pathname").should(
            "eq",
            `/admin/settings/custom-visualizations/edit/${plugin.id}`,
          );
        });
      });
    });

    describe("disabling a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("disabled plugin should fall back to default display and hide from chart type selector", () => {
        H.resetSnowplow();
        H.enableTracking();
        H.setupCustomVizPlugin().then(() => {
          // Single-value question (Count of Orders) — demo-viz requires
          // exactly one row with one numeric column.
          H.createQuestion(
            {
              name: "Custom Viz Disable Test",
              query: {
                "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
                aggregation: [["count"]],
              },
              display: H.CUSTOM_VIZ_DISPLAY,
            },
            { wrapId: true, idAlias: "disableCardId", visitQuestion: true },
          );
          H.main()
            .findByText("Custom viz rendered successfully")
            .should("be.visible");

          H.getProfileLink().click();
          H.popover().findByText(adminAppLinkText).click();

          cy.findByTestId("admin-layout-sidebar")
            .findByText("Custom visualizations")
            .click();

          cy.findByTestId("admin-layout-sidebar")
            .findByText("Manage visualizations")
            .should("be.visible")
            .click();

          // Actions menu is only visible on row hover
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Disable").click();
          H.expectUnstructuredSnowplowEvent({
            event: "custom_viz_plugin_toggled",
            event_detail: "disabled",
          });

          // Menu should now show "Enable" instead of "Disable"
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Enable").should("be.visible");

          H.getProfileLink().click();
          H.popover().findByText(mainAppLinkText).click();

          cy.get("main").within(() => {
            cy.contains("Custom Viz Disable Test").click();
          });
          // Reload the question — plugin is disabled, should fall back

          cy.log("make sure viz is table - fallback");
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
          H.expectNoBadSnowplowEvents();

          cy.log("make sure fallback is used after reload");
          cy.reload();
          cy.findByText("Custom visualizations").should("not.exist");
        });
      });
    });

    describe("deleting a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("question should fall back when plugin is deleted", () => {
        H.resetSnowplow();
        H.enableTracking();
        H.setupCustomVizPlugin().then(() => {
          H.createQuestion(
            {
              name: "Custom Viz Delete Test",
              query: {
                "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
                aggregation: [["count"]],
              },
              display: H.CUSTOM_VIZ_DISPLAY,
            },
            { wrapId: true, idAlias: "deleteCardId" },
          );

          H.visitCustomVizSettings();

          // Delete the plugin (actions menu is only visible on row hover)
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Remove").click();

          H.modal().within(() => {
            cy.findByText("Remove this visualization?").should("be.visible");
            cy.findByRole("button", { name: "Remove" }).click();
          });

          H.main()
            .findByText("You don't have any custom visualizations.")
            .should("be.visible");
          H.expectUnstructuredSnowplowEvent({
            event: "custom_viz_plugin_deleted",
          });

          // Visit the question — should fall back to table
          H.visitQuestion("@deleteCardId");
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
          H.expectNoBadSnowplowEvents();
        });
      });
    });
  });

  describe("using a plugin — question", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);

      // Default-view (table) Count-of-Orders card — demo-viz requires
      // exactly one row with one numeric column.
      H.createQuestion(
        {
          name: "Custom Viz Question Test",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "table",
        },
        { wrapId: true, idAlias: "questionId" },
      );
    });

    function switchToDemoViz() {
      cy.findByTestId("viz-type-button").click();
      cy.findByTestId("custom-viz-plugins-toggle").click();
      cy.findByTestId("demo-viz-button").click();
      // Close the picker so the viz is visible for interaction
      cy.findByTestId("viz-type-button").click();
    }

    it("renders the selected custom viz for the question", () => {
      H.resetSnowplow();
      H.enableTracking();
      H.visitQuestion("@questionId");
      switchToDemoViz();

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      H.main()
        .findByText(/Value: \d+/)
        .should("be.visible");
      // Default threshold from getDefault
      H.main().findByText("Threshold: 0").should("be.visible");
      H.expectUnstructuredSnowplowEvent({ event: "custom_viz_selected" });
      H.expectNoBadSnowplowEvents();
    });

    it("persists the selected custom viz and its settings across reloads", () => {
      H.visitQuestion("@questionId");
      switchToDemoViz();

      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("chartsettings-sidebar")
        .findByPlaceholderText("Set threshold")
        .clear()
        .type("42")
        .blur();

      H.saveSavedQuestion();

      H.interceptPluginBundle();
      cy.reload();
      cy.wait("@pluginBundle");

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      H.main().findByText("Threshold: 42").should("be.visible");
    });

    describe("errors", () => {
      it("renders errors thrown by the plugin component", () => {
        // Multi-column question — checkRenderable throws
        // "Query results should only have 1 column".
        H.createQuestion(
          {
            name: "Custom Viz Error — Multi Column",
            query: {
              "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
              limit: 5,
            },
            display: H.CUSTOM_VIZ_DISPLAY,
          },
          { visitQuestion: true },
        );

        H.main()
          .findByText(/Query results should only have 1 column/)
          .should("be.visible");
      });

      it("shows an error state when the plugin bundle fails to load", () => {
        cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", {
          statusCode: 500,
          body: "boom",
        }).as("failedBundle");

        H.createQuestion(
          {
            name: "Custom Viz — Failing Bundle",
            query: {
              "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
              aggregation: [["count"]],
            },
            display: H.CUSTOM_VIZ_DISPLAY,
          },
          { visitQuestion: true },
        );
        cy.wait("@failedBundle");

        H.undoToastList()
          .findByText(/"demo-viz" visualization is currently unavailable/)
          .should("be.visible");
      });

      it("falls back to the default viz when the bundle endpoint fails, then recovers on revisit", () => {
        const bundleMatcher = {
          method: "GET",
          pathname: "/api/ee/custom-viz-plugin/*/bundle",
        };

        cy.intercept(bundleMatcher, {
          statusCode: 503,
          body: { error: "Bundle not available" },
        }).as("bundleUnavailable");

        H.createQuestion(
          {
            name: "Custom Viz — Bundle Recovery",
            query: {
              "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
              aggregation: [["count"]],
            },
            display: H.CUSTOM_VIZ_DISPLAY,
          },
          { wrapId: true, idAlias: "recoveryCardId", visitQuestion: true },
        );

        cy.findByTestId("visualization-root")
          .findByTestId("table-root")
          .should("be.visible");

        H.undoToastList()
          .findByText(/visualization is currently unavailable/i)
          .should("be.visible");

        cy.intercept(bundleMatcher, (req) => req.continue()).as(
          "bundleRestored",
        );

        cy.reload();

        H.main()
          .findByText("Custom viz rendered successfully")
          .should("be.visible");
      });
    });

    it("falls back to the default viz on a public question (metabase#GDGT-2234)", () => {
      H.updateSetting("enable-public-sharing", true);

      H.createQuestion(
        {
          name: "Public Custom Viz Fallback",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: H.CUSTOM_VIZ_DISPLAY,
        },
        { wrapId: true, idAlias: "publicQuestionId" },
      );

      cy.get<CardId>("@publicQuestionId").then(H.visitPublicQuestion);

      cy.findByTestId("table-root").should("be.visible");
    });

    it("falls back to the default viz on an embedded question", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
        });

        H.visitEmbeddedPage({
          resource: { question: questionId },
          params: {},
        });
      });

      cy.findByTestId("table-root").should("be.visible");
    });

    it("calls onClick when the viz fires a click", () => {
      H.visitQuestion("@questionId");
      switchToDemoViz();

      cy.findByTestId("demo-viz-click-target").click();
      cy.intercept("POST", "/api/dataset").as("dataset");
      H.popover().findByText("See these Orders").should("be.visible").click();
      cy.wait("@dataset");

      // Drill opens an ad-hoc question showing the underlying Orders rows
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      H.tableInteractive().findByText("37.65").should("be.visible");
    });

    it("calls onHover and renders a tooltip", () => {
      H.visitQuestion("@questionId");
      switchToDemoViz();

      cy.findByTestId("demo-viz-hover-target").realHover();

      H.tooltip().should("contain.text", AGGREGATED_VALUE_FORMATTED);
    });

    it("renders a pinned custom-viz question in the collection view", () => {
      H.visitQuestion("@questionId");
      switchToDemoViz();
      H.saveSavedQuestion();

      cy.get("@questionId").then((id) => {
        cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
      });

      // Navigate to the collection via the question header's collection badge
      cy.findByRole("link", { name: /Our analytics/ }).click();

      H.getPinnedSection().within(() => {
        cy.findByText("Custom Viz Question Test").should("be.visible");
        cy.findByText("Custom viz rendered successfully").should("be.visible");
      });
    });

    it("passes the user's locale to the plugin and updates when the user changes it", () => {
      H.visitQuestion("@questionId");
      switchToDemoViz();
      H.saveSavedQuestion();

      // Default user locale is "en"
      cy.findByTestId("demo-viz-locale").should("have.text", "Locale: en");

      // Change the current user's locale to German. The plugin factory runs
      // again on the next full page load with the new locale value.
      cy.request("GET", "/api/user/current").then(({ body: user }) => {
        cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
      });

      H.interceptPluginBundle();
      cy.reload();
      cy.wait("@pluginBundle");

      cy.findByTestId("demo-viz-locale").should("have.text", "Locale: de");
    });
  });

  describe("using a plugin — dashboard", () => {
    before(() => {});

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
    });

    const customVizQuestionDetails: StructuredQuestionDetails = {
      name: "Custom Viz Dashboard Question",
      query: {
        "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: H.CUSTOM_VIZ_DISPLAY,
      visualization_settings: { threshold: 0 },
    };

    function createCustomVizDashboard(dashboardDetails: DashboardDetails = {}) {
      return H.createQuestionAndDashboard({
        questionDetails: customVizQuestionDetails,
        dashboardDetails: { name: "Custom Viz Dashboard", ...dashboardDetails },
      });
    }

    it("renders a custom viz question on a dashboard", () => {
      createCustomVizDashboard().then(({ body: dashcard }) => {
        H.visitDashboard(dashcard.dashboard_id);
      });

      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      H.getDashboardCard()
        .findByText(`Value: ${AGGREGATED_VALUE}`)
        .should("be.visible");
    });

    it("falls back to the default viz on a public dashboard (metabase#GDGT-2234)", () => {
      H.updateSetting("enable-public-sharing", true);

      createCustomVizDashboard().then(({ body: dashcard }) => {
        H.visitPublicDashboard(Number(checkNotNull(dashcard.dashboard_id)));
      });

      H.getDashboardCard().findByTestId("table-root").should("be.visible");
    });

    it("falls back to the default viz on an embedded dashboard", () => {
      createCustomVizDashboard().then(({ body: dashcard }) => {
        const dashboardId = Number(checkNotNull(dashcard.dashboard_id));

        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
        });

        H.visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {},
        });
      });

      H.getDashboardCard().findByTestId("table-root").should("be.visible");
    });

    it("exports the dashboard as a PDF", () => {
      cy.deleteDownloadsFolder();

      createCustomVizDashboard({ name: "custom viz pdf dash" }).then(
        ({ body: dashcard }) => {
          H.visitDashboard(dashcard.dashboard_id);
        },
      );
      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      H.openSharingMenu("Export as PDF");
      cy.findByTestId("status-root-container")
        .should("contain", "Downloading")
        .and("contain", "Dashboard for custom viz pdf dash");
      cy.verifyDownload("custom viz pdf dash.pdf", { contains: true });
    });

    it("shows a tooltip on hover over the custom viz in a dashcard", () => {
      createCustomVizDashboard().then(({ body: dashcard }) => {
        H.visitDashboard(dashcard.dashboard_id);
      });

      H.getDashboardCard().findByTestId("demo-viz-hover-target").realHover();

      H.tooltip().should("contain.text", AGGREGATED_VALUE_FORMATTED);
    });

    it("drills through on click from a dashcard", () => {
      createCustomVizDashboard().then(({ body: dashcard }) => {
        H.visitDashboard(dashcard.dashboard_id);
      });
      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      cy.intercept("POST", "/api/dataset").as("dataset");
      H.getDashboardCard().findByTestId("demo-viz-click-target").click();
      cy.findByTestId("click-actions-view")
        .findByText(/See these Orders/)
        .should("be.visible")
        .click();
      cy.wait("@dataset");

      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      // The demo plugin's query is `count(Orders)` with no breakout, so the
      // underlying-records drill produces an unfiltered Orders query.
      H.queryBuilderFiltersPanel().should("not.exist");
      H.tableInteractive().findByText("37.65").should("be.visible");
    });

    describe("click behavior: custom destinations", () => {
      it("navigates to another dashboard", () => {
        H.createDashboard(
          { name: "Custom Viz Target Dashboard" },
          { wrapId: true, idAlias: "targetDashboardId" },
        );

        cy.get<DashboardId>("@targetDashboardId").then((targetDashboardId) => {
          createCustomVizDashboard().then(({ body: dashcard }) => {
            H.addOrUpdateDashboardCard({
              dashboard_id: dashcard.dashboard_id,
              card_id: checkNotNull(dashcard.card_id),
              card: {
                id: dashcard.id,
                visualization_settings: {
                  click_behavior: {
                    parameterMapping: {},
                    targetId: targetDashboardId,
                    linkType: "dashboard",
                    type: "link",
                  },
                },
              },
            });
            H.visitDashboard(dashcard.dashboard_id);
          });

          H.getDashboardCard().findByTestId("demo-viz-click-target").click();

          cy.location("pathname").should(
            "match",
            new RegExp(`^/dashboard/${targetDashboardId}(?:-|$)`),
          );
        });
      });

      it("navigates to a saved question", () => {
        H.createQuestion(
          {
            name: "Custom Viz Target Question",
            query: {
              "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
              limit: 5,
            },
          },
          { wrapId: true, idAlias: "targetQuestionId" },
        );

        cy.get<CardId>("@targetQuestionId").then((targetQuestionId) => {
          createCustomVizDashboard().then(({ body: dashcard }) => {
            H.addOrUpdateDashboardCard({
              dashboard_id: dashcard.dashboard_id,
              card_id: checkNotNull(dashcard.card_id),
              card: {
                id: dashcard.id,
                visualization_settings: {
                  click_behavior: {
                    parameterMapping: {},
                    targetId: targetQuestionId,
                    linkType: "question",
                    type: "link",
                  },
                },
              },
            });
            H.visitDashboard(dashcard.dashboard_id);
          });

          H.getDashboardCard().findByTestId("demo-viz-click-target").click();

          cy.location("pathname").should(
            "match",
            new RegExp(`^/question/${targetQuestionId}(?:-|$)`),
          );
        });
      });

      it("opens a URL", () => {
        createCustomVizDashboard().then(({ body: dashcard }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: checkNotNull(dashcard.card_id),
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
          H.visitDashboard(dashcard.dashboard_id);
        });

        H.onNextAnchorClick((anchor: HTMLAnchorElement) => {
          expect(anchor).to.have.attr(
            "href",
            "https://metabase.test/custom-viz",
          );
        });
        H.getDashboardCard().findByTestId("demo-viz-click-target").click();
      });

      it("updates a dashboard filter", () => {
        const parameter: Parameter = {
          id: "12345678",
          name: "Count",
          slug: "count",
          type: "number/=",
        };

        H.createQuestionAndDashboard({
          questionDetails: customVizQuestionDetails,
          dashboardDetails: {
            name: "Custom Viz Crossfilter Dashboard",
            parameters: [parameter],
          },
        }).then(({ body: dashcard }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: checkNotNull(dashcard.card_id),
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
          H.visitDashboard(dashcard.dashboard_id);
        });

        H.getDashboardCard()
          .findByText(/Value: \d+/)
          .should("be.visible");
        H.getDashboardCard().findByTestId("demo-viz-click-target").click();

        // The crossfilter behavior sets the dashboard parameter to the value of
        // the clicked column.
        cy.location("search").should(
          "include",
          `${parameter.slug}=${AGGREGATED_VALUE}`,
        );
      });
    });
  });

  describe("using a plugin — documents", () => {
    const DOC_QUESTION_NAME = "Custom Viz Doc Question";

    before(() => {});

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);

      H.createQuestion(
        {
          name: DOC_QUESTION_NAME,
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: H.CUSTOM_VIZ_DISPLAY,
        },
        { wrapId: true, idAlias: "questionId" },
      );

      // Query the card once so it appears in the /chart command's recent list.
      cy.get<CardId>("@questionId").then((cardId) => {
        cy.request("POST", `/api/card/${cardId}/query`);
      });
    });

    describe("regular documents", () => {
      beforeEach(() => {
        cy.get<CardId>("@questionId").then((cardId) => {
          H.createDocument({
            name: "Doc with Custom Viz",
            document: buildDocumentWithCustomVizCard(cardId),
            collection_id: null,
            idAlias: "documentId",
          });
        });
      });

      it("renders the custom viz when the document is opened", () => {
        H.interceptPluginBundle();
        H.visitDocument("@documentId");
        cy.wait("@pluginBundle");

        H.getDocumentCard(DOC_QUESTION_NAME).within(() => {
          cy.findByText("Custom viz rendered successfully").should(
            "be.visible",
          );
          cy.findByText(/Value: \d+/).should("be.visible");
        });
      });

      it("falls back to the default visualization when the plugin bundle fails to load", () => {
        cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", {
          statusCode: 500,
          body: "boom",
        }).as("failedBundle");

        H.visitDocument("@documentId");
        cy.wait("@failedBundle");

        H.getDocumentCard(DOC_QUESTION_NAME).within(() => {
          cy.findByText("Custom viz rendered successfully").should("not.exist");
          cy.findByTestId("table-root").should("be.visible");
        });
      });
    });

    describe("inserting via / command", () => {
      beforeEach(() => {
        H.createDocument({
          name: "Empty Doc",
          document: {
            type: "doc",
            content: [{ type: "paragraph", attrs: { _id: "1" } }],
          },
          collection_id: null,
          idAlias: "documentId",
        });
      });

      it("renders the custom viz when added via the /chart command", () => {
        H.interceptPluginBundle();
        H.visitDocument("@documentId");

        H.documentContent().click();
        H.addToDocument("/", false);
        H.commandSuggestionItem("Chart").click();
        H.commandSuggestionDialog().findByText(DOC_QUESTION_NAME).click();

        cy.wait("@pluginBundle");

        H.getDocumentCard(DOC_QUESTION_NAME)
          .findByText("Custom viz rendered successfully")
          .should("be.visible");
      });
    });

    describe("public sharing", () => {
      beforeEach(() => {
        H.updateSetting("enable-public-sharing", true);

        cy.get<CardId>("@questionId").then((cardId) => {
          H.createDocument({
            name: "Public Doc with Custom Viz",
            document: buildDocumentWithCustomVizCard(cardId),
            collection_id: null,
            idAlias: "documentId",
          });
        });
      });

      it("falls back to the default viz on a public document", () => {
        H.visitPublicDocument("@documentId");

        H.getDocumentCard(DOC_QUESTION_NAME)
          .findByTestId("table-root")
          .should("be.visible");
      });
    });
  });

  describe("icon rendering across the app", () => {
    const ICON_QUESTION_NAME = "Custom Viz Icon Test";
    const UNPINNED_QUESTION_NAME = "Custom Viz Icon Test — List";
    const DASHBOARD_NAME = "Custom Viz Icon Dashboard";
    const DOC_NAME = "Custom Viz Icon Document";
    // EntityIcon renders as a CSS-masked span whose `mask-image: url(...)`
    // points at /api/ee/custom-viz-plugin/:id/asset?path=icon.svg. Matching on
    // that URL fragment is the most stable signal that the plugin icon is
    // actually rendered — some consumers pass `alt` (accessible name) while
    // others render the icon as decorative/aria-hidden.
    const PLUGIN_ICON_SELECTOR = 'span[style*="custom-viz-plugin"]';

    before(() => {});

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);

      // Main question: pinned with preview hidden so the pinned card shows
      // the plugin icon instead of the rendered viz. Also bookmarked, queried
      // (for recents), and embedded in a document below.
      H.createQuestion(
        {
          name: ICON_QUESTION_NAME,
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: H.CUSTOM_VIZ_DISPLAY,
        },
        { wrapId: true, idAlias: "questionId" },
      );

      cy.get<CardId>("@questionId").then((cardId) => {
        cy.request("PUT", `/api/card/${cardId}`, {
          collection_position: 1,
          collection_preview: false,
        });
        cy.request("POST", `/api/card/${cardId}/query`);
        cy.request("POST", `/api/bookmark/card/${cardId}`);
      });

      // Secondary unpinned question — used to assert the icon on a regular
      // (non-pinned) collection list row.
      H.createQuestion({
        name: UNPINNED_QUESTION_NAME,
        query: {
          "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: H.CUSTOM_VIZ_DISPLAY,
      });

      H.createDashboard(
        { name: DASHBOARD_NAME },
        { wrapId: true, idAlias: "dashboardId" },
      );
      cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
        cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
      });

      cy.get<CardId>("@questionId").then((cardId) => {
        H.createDocument({
          name: DOC_NAME,
          document: buildDocumentWithCustomVizCard(cardId),
          collection_id: null,
          idAlias: "documentId",
        });
      });
      cy.get("@documentId").then((documentId) => {
        cy.request("POST", `/api/bookmark/document/${documentId}`);
      });
    });

    it("renders the custom-viz icon in the entity picker data-source modal", () => {
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        H.entityPickerModalItem(1, ICON_QUESTION_NAME)
          .find(PLUGIN_ICON_SELECTOR)
          .should("exist");
      });
    });

    it("renders the custom-viz icon across app surfaces when navigating through the UI", () => {
      // Some routes (/search, dashboard edit mode) collapse the nav sidebar.
      // Call this before any nav-sidebar interaction so we open it only when
      // it's actually hidden — `H.openNavigationSidebar` toggles, so calling
      // it unconditionally would close an already-open sidebar.
      const ensureNavigationSidebarOpen = () => {
        cy.get("body").then(($body) => {
          const visible = $body.find(
            '[data-testid="main-navbar-root"]:visible',
          ).length;
          if (!visible) {
            H.openNavigationSidebar();
          }
        });
      };

      H.interceptPluginBundle();

      cy.visit("/collection/root");

      cy.log("Navigation sidebar bookmark");
      H.navigationSidebar()
        .findByRole("link", { name: new RegExp(ICON_QUESTION_NAME) })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      cy.log("Unpinned collection list row");
      cy.findByRole("row", { name: new RegExp(UNPINNED_QUESTION_NAME) })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      cy.log("Pinned section (collection_preview: false → icon, not viz)");
      H.getPinnedSection().find(PLUGIN_ICON_SELECTOR).should("exist");

      cy.log("Navigate → question editor by clicking the pinned card title");
      H.getPinnedSection().findByText(ICON_QUESTION_NAME).click();
      cy.wait("@pluginBundle");

      cy.log("Chart type sidebar on the question editor");
      H.openVizTypeSidebar();
      H.vizTypeSidebar()
        .findByRole("img", { name: "demo-viz" })
        .should("be.visible");
      H.openVizTypeSidebar();

      cy.log("Command palette option row");
      H.commandPaletteSearch(ICON_QUESTION_NAME, false);
      H.commandPalette()
        .findAllByRole("option", { name: new RegExp(ICON_QUESTION_NAME) })
        .first()
        .find(PLUGIN_ICON_SELECTOR)
        .should("be.visible");

      cy.log(
        'Search results page — reached by clicking "View and filter all …"',
      );
      H.commandPalette()
        .findByText(/View and filter all .* results/)
        .click();
      cy.findAllByTestId("search-result-item")
        .filter(`:contains(${ICON_QUESTION_NAME})`)
        .first()
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      cy.log('Navigate → home via the nav-sidebar "Home" link');
      ensureNavigationSidebarOpen();
      H.navigationSidebar().findByText("Home").click();

      cy.log("Home recently-viewed section");
      H.main()
        .findByText("Pick up where you left off")
        .parent()
        .findByRole("link", { name: new RegExp(ICON_QUESTION_NAME) })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      cy.log("Navigate → dashboard via bookmark link in the nav sidebar");
      ensureNavigationSidebarOpen();
      H.navigationSidebar()
        .findByRole("link", { name: new RegExp(DASHBOARD_NAME) })
        .click();

      cy.log("Dashboard add-questions sidesheet");
      H.editDashboard();
      H.openQuestionsSidebar();
      cy.findByTestId("add-card-sidebar")
        .findByRole("menuitem", { name: ICON_QUESTION_NAME })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      // Exit edit mode so the next click-to-navigate isn't blocked by an
      // unsaved-changes prompt.
      cy.findByRole("button", { name: /Cancel/i }).click();

      cy.log("Navigate → document via bookmark link");
      ensureNavigationSidebarOpen();
      H.navigationSidebar()
        .findByRole("link", { name: new RegExp(DOC_NAME) })
        .click();

      cy.log("Document mention dialog (@ suggestions)");
      // By the time we reach this step the plugin list has already been
      // fetched for the embedded card, so no need to wait on it again.
      // Click into the intro paragraph — clicking blindly on document-content
      // may land on the embedded card.
      H.documentContent().findByText("Custom viz embedded below:").click();
      cy.realPress("End");
      cy.realType(" @");
      H.documentMentionDialog().should("be.visible");
      cy.realType("Custom");
      // Both the pinned and the unpinned questions appear — assert the icon
      // renders on every matching option.
      H.documentMentionDialog()
        .findAllByRole("option", { name: new RegExp(ICON_QUESTION_NAME) })
        .should("have.length.at.least", 2)
        .each(($option) => {
          cy.wrap($option).find(PLUGIN_ICON_SELECTOR).should("exist");
        });
      cy.realPress("Escape");

      cy.log('Document "Visualize as" panel on the embedded card');
      H.openDocumentCardMenu(ICON_QUESTION_NAME);
      H.popover().findByText("Edit Visualization").click();
      H.getDocumentSidebar()
        .findByRole("button", { name: /demo-viz/i })
        .click();
      cy.findByRole("menu")
        .findByRole("menuitem", { name: /demo-viz/i })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");
    });
  });

  describe("development mode", () => {
    const CUSTOM_VIZ_DEV_PROJECT_NAME = "custom-viz-dev-plugin";
    const CUSTOM_VIZ_DEV_PORT = 5174;
    const TIMEOUT = 120000;
    const tmpDir = `${Cypress.config("projectRoot")}/e2e/tmp`;
    const sdkDir = `${Cypress.config("projectRoot")}/enterprise/frontend/src/custom-viz`;
    const cliPath = `${sdkDir}/dist/cli.js`;
    const projectDir = `${tmpDir}/${CUSTOM_VIZ_DEV_PROJECT_NAME}`;
    const devUrl = `http://localhost:${CUSTOM_VIZ_DEV_PORT}`;
    const pluginSrcPath = `${projectDir}/src/index.tsx`;
    const QUESTION_NAME = "Custom Viz Dev Mode Question Test";
    let devServerPid: number | null = null;

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.updateSetting("custom-viz-enabled", true);
    });

    before(() => {
      cy.exec(`mkdir -p ${tmpDir}`);
      cy.log("Build the SDK so we can use the repo-local CLI");
      cy.exec(`cd "${sdkDir}" && bun install && bun run build`, {
        timeout: TIMEOUT,
      });

      // Scaffold the boilerplate plugin using the init CLI command.
      cy.exec(`rm -rf "${projectDir}"`, { timeout: TIMEOUT });
      cy.exec(
        `cd "${tmpDir}" && node "${cliPath}" init "${CUSTOM_VIZ_DEV_PROJECT_NAME}"`,
        {
          timeout: TIMEOUT,
        },
      );

      // The scaffolded template requires Metabase >= 60.0, but the e2e runner may
      // run an older version. Rewrite the manifest to a permissive range so the
      // dev-only plugin is included in /api/ee/custom-viz-plugin/list and becomes
      // selectable in the visualization picker.
      cy.readFile(`${projectDir}/metabase-plugin.json`).then((manifest) => {
        cy.writeFile(
          `${projectDir}/metabase-plugin.json`,
          JSON.stringify(
            {
              ...manifest,
              metabase: {
                ...(manifest?.metabase ?? {}),
                version: "", // empty strings means compatibility with any version
              },
            },
            null,
            2,
          ),
        );
      });

      // Install dependencies in the tmp plugin folder.
      cy.exec(`cd "${projectDir}" && npm i`, { timeout: TIMEOUT });

      // Start the plugin dev server and keep it running
      cy.task<{ pid: number }>("startCustomVizDevServer", {
        cwd: projectDir,
      }).then(({ pid }) => {
        devServerPid = pid;
      });
    });

    after(() => {
      if (devServerPid == null) {
        return;
      }

      cy.task("stopCustomVizDevServer", devServerPid);
    });

    it("should load a dev-only plugin from a local dev server URL and use it in a question", () => {
      H.visitCustomVizDevelopment();

      cy.findByLabelText(/Dev server URL/).type(devUrl);
      cy.log(
        "It should not be possible to add the plugin until the user understands the risks",
      );
      cy.findByRole("button", { name: /Add/ }).should("be.disabled");
      cy.findByLabelText(/I understand/).click();

      cy.findByRole("button", { name: /Add/ }).click();

      cy.log("Verify the dev plugin is registered.");
      H.main().findByText(CUSTOM_VIZ_DEV_PROJECT_NAME).should("be.visible");

      // Use the dev plugin in a question (Count of Orders) — this yields a
      // single numeric value so the scaffolded plugin renders.
      H.createQuestion(
        {
          name: "Custom Viz Dev Mode Question Test",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "table",
        },
        { visitQuestion: true },
      );

      cy.findByTestId("viz-type-button").click();
      cy.findByTestId("custom-viz-plugins-toggle").click();
      cy.log("Checking if dev badge is visible");
      cy.findByLabelText(
        "This is a development version of the visualization",
      ).should("exist");
      cy.findByTestId(`${CUSTOM_VIZ_DEV_PROJECT_NAME}-button`).click();

      // Close the picker so the viz is visible.
      cy.findByTestId("viz-type-button").click();

      cy.log(
        "Threshold defaults to 0 and Count(Orders) is > 0, so the thumbs-up SVG should render.",
      );
      // Use the plugin's unique viewBox to avoid matching UI icon SVGs.
      const pluginPath = 'svg[viewBox="0 0 17 16"] > path';
      H.main().find(pluginPath).should("be.visible");
      H.main().find(pluginPath).should("not.have.attr", "transform");

      cy.log("Modifying plugin source to change the SVG fill color");
      cy.readFile(pluginSrcPath).then((src) => {
        const updated = src.replace(
          'fill="var(--mb-color-brand)"',
          'fill="red"',
        );
        if (updated === src) {
          throw new Error(`Expected to replace fill in ${pluginSrcPath}`);
        }
        cy.writeFile(pluginSrcPath, updated);
      });

      cy.log("Checking if hot reload works");
      H.main().find(pluginPath).should("have.attr", "fill", "red");

      cy.log("Verify plugin settings affect rendering.");
      cy.log(
        "Set threshold higher than Count(Orders) so it flips to thumbs-down (rotated path).",
      );
      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("chartsettings-sidebar")
        .findByPlaceholderText("Set threshold")
        .clear()
        .type("100000");
      cy.findByRole("button", {
        name: /Done/,
      }).click();
      H.main()
        .find(pluginPath)
        .should("have.attr", "transform")
        .and("match", /rotate\(-180/);

      cy.log(
        "Saving the question and reloading to verify persistence of settings and dev URL",
      );
      cy.log("handling modal");
      H.saveQuestion(QUESTION_NAME, { shouldReplaceOriginalQuestion: true });
      // Wait for the dialog to close
      cy.findByRole("dialog", { name: /Save question/ }).should("not.exist");
      cy.reload();
      H.main()
        .find(pluginPath)
        .should("have.attr", "transform")
        .and("match", /rotate\(-180/);

      cy.log(
        "When the dev server is stopped, the visualization should revert to the default",
      );
      cy.task("stopCustomVizDevServer", devServerPid);
      cy.reload();
      H.main().findByText("18,760").should("be.visible");
    });
  });
});

describe.only("sandbox", () => {
  let sandboxCardId: number;
  before(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("custom-viz-enabled", true);
    H.setupCustomVizPlugin();

    H.createQuestion({
      name: "Custom Viz Sandbox Test",
      query: {
        "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
        aggregation: [["count"]],
      },
      display: H.CUSTOM_VIZ_DISPLAY,
    }).then(({ body }) => {
      sandboxCardId = body.id;
    });
  });

  beforeEach(() => {
    cy.signInAsAdmin();
    cy.wrap(sandboxCardId).as("sandboxCardId");
    // The sandbox throws by design when an attack vector is exercised
    // (innerHTML sanitization, blocked APIs, etc.). React's reconciler
    // surfaces those throws as "Uncaught" in the console; Cypress's
    // default behavior fails the test on any AUT uncaught exception.
    // Suppress that here — we verify blocking behavior via the explicit
    // assertions instead.
    cy.on("uncaught:exception", () => false);
  });

  const blockedPattern = (suffix: RegExp) =>
    new RegExp(String.raw`\[plugin \d+\] blocked ${suffix.source}`);

  const SANDBOX_CASES: Array<{
    name: string;
    payload: string;
    errorPattern: RegExp;
    before?: () => void;
    additionalAssertions?: () => void;
  }> = [
    {
      name: "window.fetch",
      payload: 'window.fetch("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.fetch/),
      before: () => {
        cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
          "canary",
        );
      },
      additionalAssertions: () => {
        cy.get("@canary.all").should("have.length", 0);
      },
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
      // Hits createElementDistortion's BLOCKED_TAGS — different code path
      // and different error format ("blocked createElement: <tag>") from
      // the API-call cases above.
      name: 'createElement("script")',
      payload: 'document.createElement("script");',
      errorPattern: blockedPattern(/createElement: script/),
    },
    // `eval` / `new Function(...)` Near membrane allows these in the sandbox, but
    // it still catches anything they evaluate (e.g. `eval('window.fetch(...)')` triggers the fetch
    // distortion), so it's not an escape — just not blocked at access.
    {
      name: "eval-evaluated fetch",
      payload:
        "eval('window.fetch(\"/api/canary-should-be-blocked-by-sandbox\")');",
      errorPattern: blockedPattern(/API call: window\.fetch/),
      before: () => {
        cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
          "canary",
        );
      },
      additionalAssertions: () => {
        cy.get("@canary.all").should("have.length", 0);
      },
    },
    {
      name: "XMLHttpRequest",
      payload: "new XMLHttpRequest();",
      errorPattern: blockedPattern(/API call: window\.XMLHttpRequest/),
    },
    {
      name: "document.cookie setter",
      payload: 'document.cookie = "${document.cookie}stolen=1;";',
      errorPattern: blockedPattern(/API call: set cookie/),
    },
    {
      name: "window.open",
      payload: 'window.open("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.open/),
      before: () => {
        cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
          "canary",
        );
      },
      additionalAssertions: () => {
        cy.get("@canary.all").should("have.length", 0);
      },
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
      // Try to defeat the membrane by binding a non-allowlisted native.
      // Safe because `window.fetch` access already
      // returns a `blocked` function. Binding it produces a bound
      // function that still throws when called.
      name: "window.fetch.bind(window) bypass attempt",
      payload:
        'window.fetch.bind(window)("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.fetch/),
      before: () => {
        cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
          "canary",
        );
      },
      additionalAssertions: () => {
        cy.get("@canary.all").should("have.length", 0);
      },
    },
    {
      // Try to bypass via Function.prototype.bind.call. Confirms the check
      // isn't sensitive to which side initiates the bind.
      name: "Function.prototype.bind.call(window.fetch, ...) bypass attempt",
      payload:
        'Function.prototype.bind.call(window.fetch, window)("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.fetch/),
      before: () => {
        cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
          "canary",
        );
      },
      additionalAssertions: () => {
        cy.get("@canary.all").should("have.length", 0);
      },
    },
  ];

  it.each<(typeof SANDBOX_CASES)[number]>(SANDBOX_CASES)(
    (testCase) => `blocks ${testCase.name} called by injected plugin code`,
    (testCase) => {
      const { payload, errorPattern } = testCase;
      testCase.before?.();

      cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
        req.continue((res) => {
          res.body = `console.log("injected bundle");${payload}\n${String(res.body)};\n`;
          res.send();
        });
      }).as("injectedBundle");

      cy.get<number>("@sandboxCardId").then((id) => {
        cy.visit(`/question/${id}`, {
          onBeforeLoad(win) {
            cy.spy(win.console, "log").as("consoleLog");
            cy.spy(win.console, "error").as("consoleError");
          },
        });
      });
      cy.wait("@injectedBundle");

      // sandbox.evaluate threw → loadCustomVizPlugin caught it → toast
      // surfaced and the viz fell back to the default table.
      cy.findByTestId("visualization-root")
        .findByTestId("table-root")
        .should("be.visible");
      H.undoToastList()
        .findByText(/"demo-viz" visualization is currently unavailable/)
        .should("be.visible");
      cy.get("@consoleLog").should("be.calledWith", "injected bundle");
      cy.get("@consoleError").should(
        "have.been.calledWithMatch",
        /Failed to load plugin/,
        Cypress.sinon.match.has("message", Cypress.sinon.match(errorPattern)),
      );

      testCase.additionalAssertions?.();
    },
  );

  // innerHTML/outerHTML/insertAdjacentHTML go through DOMPurify rather than
  // being blocked outright, so this case doesn't fit the "expect a thrown
  // error and a fallback viz" shape of SANDBOX_CASES. Instead we inject an
  // <img onerror> — which the browser would execute in the host realm if it
  // survived assignment — and confirm DOMPurify stripped it by checking the
  // onerror's side effect (a fetch to the canary URL) never happens.
  it("sanitizes innerHTML through DOMPurify before it reaches the DOM", () => {
    cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
      "canary",
    );

    const payload = `
      var d = document.createElement('div');
      d.innerHTML = '<img src="x" onerror="fetch(\\'/api/canary-should-be-blocked-by-sandbox\\')">';
      document.body.appendChild(d);
    `;

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${payload}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");

    cy.get<CardId>("@sandboxCardId").then((id) => {
      cy.visit(`/question/${id}`, {
        onBeforeLoad(win) {
          cy.spy(win.console, "error").as("consoleError");
        },
      });
    });
    cy.wait("@injectedBundle");

    // Viz still renders — sanitization mutates the HTML but doesn't throw.
    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");
    cy.get("@canary.all").should("have.length", 0);
    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /\[plugin \d+\] DOMPurify stripped content from innerHTML/,
    );
  });

  it("isolates DOM access to the plugin subtree (out-of-scope reads and writes hit a decoy)", () => {
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

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${payload}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");

    cy.get<CardId>("@sandboxCardId").then((id) => {
      cy.visit(`/question/${id}`, {
        onBeforeLoad(win) {
          cy.spy(win.console, "log").as("consoleLog");
          cy.spy(win.console, "error").as("consoleError");
        },
      });
    });
    cy.wait("@injectedBundle");

    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");

    // The plugin reached for visualization-root but received a decoy with
    // data-plugin-sandbox-decoy="true" instead of the real element.
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin saw decoy",
      "true",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin read element id",
      "sandbox-decoy",
    );

    // The swap is reported to host console for diagnostics.
    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /\[plugin \d+\] swapped out-of-scope <div id="root"> with decoy/,
    );

    // The real host element was untouched.
    cy.get(hostSelector).should("not.have.attr", "data-pwned-by-plugin");
  });

  it("MutationObserver on out-of-scope nodes observes a decoy and never fires for host mutations", () => {
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

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${payload}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");

    cy.get<CardId>("@sandboxCardId").then((id) => {
      cy.visit(`/question/${id}`, {
        onBeforeLoad(win) {
          cy.spy(win.console, "log").as("consoleLog");
          cy.spy(win.console, "error").as("consoleError");
        },
      });
    });
    cy.wait("@injectedBundle");

    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");

    // Mutate the real host DOM. If the plugin held a real reference to
    // document.body, these would fire its observer. The membrane swapped
    // body for a detached decoy, so observation is wired to a node that
    // never sees host changes.
    cy.document().then((doc) => {
      const probe = doc.createElement("div");
      probe.setAttribute("data-mutation-probe", "true");
      doc.body.appendChild(probe);
      doc.body.setAttribute("data-mutation-probe-attr", "true");
      probe.remove();
      doc.body.removeAttribute("data-mutation-probe-attr");
    });

    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /\[plugin \d+\] swapped out-of-scope <body> with decoy/,
    );
  });
});
