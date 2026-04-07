const { H } = cy;

// eslint-disable-next-line no-only-tests/no-only-tests
describe.only("admin > custom visualizations", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("admin settings page", () => {
    it("should add a plugin via the form and show it in the list", () => {
      H.setupCustomVizRepo();
      H.visitCustomVizSettings();

      cy.findByRole("link", { name: /Add visualization/ }).click();

      cy.findByLabelText(/Repository URL/).type(H.CUSTOM_VIZ_REPO_URL);
      H.interceptPluginCreate();
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@pluginCreate");

      // Should redirect to list and show the plugin
      cy.get("main").findByText("demo-viz").should("be.visible");
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

      it("should re-fetch a plugin", () => {
        H.interceptPluginRefresh();
        cy.findByRole("button", { name: /ellipsis/i }).click();
        H.popover().findByText("Re-fetch").click();
        cy.wait("@pluginRefresh");
      });

      it("should disable and re-enable a plugin", () => {
        cy.findByRole("button", { name: /ellipsis/i }).click();
        H.popover().findByText("Disable").click();

        cy.findByRole("button", { name: /ellipsis/i }).click();
        H.popover().findByText("Enable").should("be.visible");
      });

      it("should remove a plugin", () => {
        cy.findByRole("button", { name: /ellipsis/i }).click();
        H.popover().findByText("Remove").click();

        cy.get("main")
          .findByText("You don't have any custom visualizations.")
          .should("be.visible");
      });
    });

    it("should send access_token in the request when provided", () => {
      H.setupCustomVizRepo();
      H.visitCustomVizSettings();

      cy.findByRole("link", { name: /Add visualization/ }).click();

      cy.findByLabelText(/Repository URL/).type(H.CUSTOM_VIZ_REPO_URL);
      cy.findByLabelText(/Repository access token/).type("test-token-123");

      cy.intercept("POST", "/api/ee/custom-viz-plugin", (req) => {
        expect(req.body.access_token).to.equal("test-token-123");
      }).as("pluginCreateWithToken");

      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@pluginCreateWithToken");
    });
  });

  describe("plugin loading and rendering", () => {
    beforeEach(() => {
      H.setupCustomVizPlugin();
      H.interceptPluginBundle();
    });

    // Placeholder for rendering tests — will be filled from the test plan
  });

  describe("error handling", () => {
    // Placeholder for error scenario tests
  });

  describe("refresh and update flows", () => {
    beforeEach(() => {
      H.setupCustomVizPlugin();
    });

    // Placeholder for refresh/update tests
  });
});
