import { SAMPLE_DB_TABLES, USER_GROUPS } from "e2e/support/cypress_data";
import type { CustomVizPlugin } from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP } = USER_GROUPS;

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

      it("should show manage page with valid token", () => {
        H.activateToken("bleeding-edge");
        H.visitCustomVizSettings();

        H.main()
          .findByText("Manage custom visualizations")
          .should("be.visible");
        H.getAddVisualizationLink().should("be.visible");
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
    });

    describe("OSS", { tags: "@OSS" }, () => {
      it("should show upsell when feature is locked", () => {
        H.visitCustomVizSettings();

        cy.findByRole("heading", {
          name: /Build your own visualizations/,
        }).should("be.visible");
        H.getAddVisualizationLink().should("not.exist");
      });
    });
  });

  describe("admin settings page", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
    });

    it("should add a plugin via the form and show it in the list", () => {
      H.setupCustomVizRepo();
      H.visitCustomVizSettings();

      H.getAddVisualizationLink().click();

      cy.findByLabelText(/Repository URL/).type(H.CUSTOM_VIZ_REPO_URL);
      cy.findByLabelText(/I understand/).click();
      H.interceptPluginCreate();
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@pluginCreate");

      // Should redirect to list and show the plugin
      H.main().findByText("demo-viz").should("be.visible");
    });

    it("should display manifest information and commit SHA after registration", () => {
      H.setupCustomVizPlugin();

      // Get the actual latest commit SHA from the local git repo
      cy.exec(`git -C ${H.CUSTOM_VIZ_REPO_PATH} rev-parse HEAD`).then(
        ({ stdout: commitSha }) => {
          H.visitCustomVizSettings();

          // Icon from manifest
          H.getCustomVizPluginIcon("demo-viz").should("be.visible");

          // Display name from manifest
          H.main().findByText("demo-viz").should("be.visible");

          // Commit SHA matches the latest main commit (8-char prefix)
          H.main()
            .findByText(`Commit: ${commitSha.trim().slice(0, 8)}`)
            .should("be.visible");
        },
      );
    });

    it("should show error status for invalid repo URL", () => {
      H.visitCustomVizNewForm();

      cy.findByLabelText(/Repository URL/).type(
        "file:///nonexistent/repo/.git",
      );
      cy.findByLabelText(/I understand/).click();

      cy.intercept("POST", "/api/ee/custom-viz-plugin").as(
        "pluginCreateInvalid",
      );
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@pluginCreateInvalid");

      // API returns 200 with status "error" — redirects to manage page
      // where the error message is shown in the plugin list item
      H.main()
        .findByText(/Failed to clone git repository/)
        .should("be.visible");
    });

    it("should support multiple plugins", () => {
      H.setupCustomVizRepo();
      H.setupCustomVizRepo2();
      H.addCustomVizPlugin(H.CUSTOM_VIZ_REPO_URL);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_REPO_URL_2);
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
        H.main().findByText(H.CUSTOM_VIZ_REPO_URL).should("be.visible");
      });
    });

    // We can't test this with a local git repo, but we can test that the token is sent
    it("should send access_token in the request when provided", () => {
      H.setupCustomVizRepo();
      H.visitCustomVizSettings();

      H.getAddVisualizationLink().click();

      cy.findByLabelText(/Repository URL/).type(H.CUSTOM_VIZ_REPO_URL);
      cy.findByLabelText(/Repository access token/).type("test-token-123");
      cy.findByLabelText(/I understand/).click();

      cy.intercept("POST", "/api/ee/custom-viz-plugin", (req) => {
        expect(req.body.access_token).to.equal("test-token-123");
      }).as("pluginCreateWithToken");

      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@pluginCreateWithToken");
    });

    describe("updating a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("should update commit after refetch", () => {
        H.setupCustomVizPlugin().then((plugin: CustomVizPlugin) => {
          const initialCommit = plugin.resolved_commit;
          if (initialCommit == null) {
            throw new Error("expected plugin.resolved_commit to be set");
          }

          // Make a new commit in the repo
          H.updateFixtureAndCommit(() => {
            cy.writeFile(
              `${H.CUSTOM_VIZ_REPO_PATH}/dist/dummy.txt`,
              "trigger new commit",
            );
          }, "Second commit");

          H.visitCustomVizSettings();

          // Verify initial commit is shown
          H.main()
            .findByText(new RegExp(`Commit: ${initialCommit.slice(0, 8)}`))
            .should("be.visible");

          // Refetch (the actions menu is only visible on row hover)
          H.interceptPluginRefresh();
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Re-fetch").click();
          cy.wait("@pluginRefresh").then(({ response }) => {
            const newCommit: string | null | undefined =
              response?.body?.resolved_commit;
            expect(newCommit).to.not.equal(initialCommit);
            if (newCommit == null) {
              throw new Error(
                "expected refreshed plugin.resolved_commit to be set",
              );
            }

            // Verify updated commit is shown
            H.main()
              .findByText(new RegExp(`Commit: ${newCommit.slice(0, 8)}`))
              .should("be.visible");
          });
        });
      });

      it("should update pinned version via edit form", () => {
        H.setupCustomVizPlugin().then((plugin: CustomVizPlugin) => {
          H.visitCustomVizEditForm(plugin.id);

          cy.findByLabelText(/Pinned version/)
            .clear()
            .type("main");

          cy.intercept("PUT", `/api/ee/custom-viz-plugin/${plugin.id}`).as(
            "pluginUpdate",
          );
          cy.findByRole("button", { name: /Save/ }).click();

          cy.wait("@pluginUpdate").then(({ request }) => {
            expect(request.body.pinned_version).to.equal("main");
          });
        });
      });
    });

    describe("disabling a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("disabled plugin should fall back to default display and hide from chart type selector", () => {
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

          H.visitCustomVizSettings();
          // Actions menu is only visible on row hover
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Disable").click();

          // Menu should now show "Enable" instead of "Disable"
          H.main().findByText("demo-viz").realHover();
          cy.findByRole("button", { name: "Plugin actions" }).click();
          H.popover().findByText("Enable").should("be.visible");

          // Reload the question — plugin is disabled, should fall back
          H.visitQuestion("@disableCardId");
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
        });
      });
    });

    describe("deleting a plugin", () => {
      beforeEach(() => {
        H.activateToken("bleeding-edge");
      });

      it("question should fall back when plugin is deleted", () => {
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

          H.main()
            .findByText("You don't have any custom visualizations.")
            .should("be.visible");

          // Visit the question — should fall back to table
          H.visitQuestion("@deleteCardId");
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
        });
      });
    });
  });

  describe("using a plugin — question", () => {
    before(() => {
      // Filesystem-only; runs once. Outer beforeEach restores the app DB
      // before each test but leaves the repo under e2e/tmp intact.
      H.setupCustomVizRepo();
    });

    beforeEach(() => {
      H.activateToken("bleeding-edge");
      H.addCustomVizPlugin(H.CUSTOM_VIZ_REPO_URL);

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
          .findByText(/The .*demo-viz.* visualization is currently unavailable/)
          .should("be.visible");
      });
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

      H.tooltip().should("contain.text", "18,760");
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
});
