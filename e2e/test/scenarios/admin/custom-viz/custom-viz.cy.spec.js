import { USER_GROUPS } from "e2e/support/cypress_data";

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

        cy.get("main")
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
        cy.get("main").should(
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
      cy.get("main").findByText("demo-viz").should("be.visible");
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
          cy.get("main").findByText("demo-viz").should("be.visible");

          // Commit SHA matches the latest main commit (8-char prefix)
          cy.get("main")
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
      cy.get("main")
        .findByText(/Failed to clone git repository/)
        .should("be.visible");
    });

    it("should support multiple plugins", () => {
      H.setupCustomVizRepo();
      H.setupCustomVizRepo2();
      H.addCustomVizPlugin(H.CUSTOM_VIZ_REPO_URL);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_REPO_URL_2);
      H.visitCustomVizSettings();

      cy.get("main").findByText("demo-viz").should("be.visible");
      cy.get("main").findByText("demo-viz-2").should("be.visible");

      // Both plugins should be available in chart type selector
      H.openOrdersTable({ limit: 1 });
      cy.findByTestId("viz-type-button").click();
      cy.get("main")
        .findByText("Custom visualizations")
        .should("be.visible")
        .click();
      cy.get("main").findByText("demo-viz").should("be.visible");
      cy.get("main").findByText("demo-viz-2").should("be.visible");
    });

    describe("with an installed plugin", () => {
      beforeEach(() => {
        H.setupCustomVizPlugin();
        H.visitCustomVizSettings();
      });

      it("should display plugin details in the list", () => {
        cy.get("main").findByText("demo-viz").should("be.visible");
        cy.get("main").findByText(H.CUSTOM_VIZ_REPO_URL).should("be.visible");
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
  });

  describe("updating a plugin", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
    });

    it("should update commit after refetch", () => {
      H.setupCustomVizPlugin().then((plugin) => {
        const initialCommit = plugin.resolved_commit;

        // Make a new commit in the repo
        H.updateFixtureAndCommit(() => {
          cy.writeFile(
            `${H.CUSTOM_VIZ_REPO_PATH}/dist/dummy.txt`,
            "trigger new commit",
          );
        }, "Second commit");

        H.visitCustomVizSettings();

        // Verify initial commit is shown
        cy.get("main")
          .findByText(new RegExp(`Commit: ${initialCommit.slice(0, 8)}`))
          .should("be.visible");

        // Refetch
        H.interceptPluginRefresh();
        cy.findByText("demo-viz").should("be.visible").realHover();
        cy.findByRole("button", { name: /ellipsis/i }).click();
        H.popover().findByText("Re-fetch").click();
        cy.wait("@pluginRefresh").then(({ response }) => {
          const newCommit = response.body.resolved_commit;
          expect(newCommit).to.not.equal(initialCommit);

          // Verify updated commit is shown
          cy.get("main")
            .findByText(new RegExp(`Commit: ${newCommit.slice(0, 8)}`))
            .should("be.visible");
        });
      });
    });

    it("should update pinned version via edit form", () => {
      H.setupCustomVizPlugin().then((plugin) => {
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
        // Create a single-value question (Count of Orders) — demo-viz
        // requires exactly one row with one numeric column
        cy.request("POST", "/api/card", {
          name: "Custom Viz Disable Test",
          dataset_query: {
            type: "query",
            query: { "source-table": 1, aggregation: [["count"]] },
            database: 1,
          },
          display: H.CUSTOM_VIZ_DISPLAY,
          visualization_settings: {},
        }).then(({ body: card }) => {
          // Verify custom viz renders properly
          H.visitQuestion(card.id);
          cy.get("main")
            .findByText("Custom viz rendered successfully")
            .should("be.visible");

          H.visitCustomVizSettings();
          cy.findByText("demo-viz").should("be.visible").realHover();
          cy.findByRole("button", { name: /ellipsis/i }).click();
          H.popover().findByText("Disable").click();

          // Menu should now show "Enable" instead of "Disable"
          cy.findByRole("button", { name: /ellipsis/i }).click();
          H.popover().findByText("Enable").should("be.visible");

          // Reload the question — plugin is disabled, should fall back
          H.visitQuestion(card.id);
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
        });
      });
    });
  });

  describe("deleting a plugin", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
    });

    it("question should fall back when plugin is deleted", () => {
      H.setupCustomVizPlugin().then(() => {
        // Create a single-value question with custom viz display
        cy.request("POST", "/api/card", {
          name: "Custom Viz Delete Test",
          dataset_query: {
            type: "query",
            query: { "source-table": 1, aggregation: [["count"]] },
            database: 1,
          },
          display: H.CUSTOM_VIZ_DISPLAY,
          visualization_settings: {},
        }).then(({ body: card }) => {
          H.visitCustomVizSettings();

          // Delete the plugin
          cy.findByText("demo-viz").should("be.visible").realHover();
          cy.findByRole("button", { name: /ellipsis/i }).click();
          H.popover().findByText("Remove").click();

          cy.get("main")
            .findByText("You don't have any custom visualizations.")
            .should("be.visible");

          // Visit the question — should fall back to table
          H.visitQuestion(card.id);
          cy.findByTestId("table-root").should("be.visible");

          // Custom viz section should not appear in chart type selector
          cy.findByTestId("viz-type-button").click();
          cy.findByText("Custom visualizations").should("not.exist");
        });
      });
    });
  });
});
