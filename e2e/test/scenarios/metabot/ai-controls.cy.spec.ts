import { ALL_USERS_GROUP_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

// A tiny valid PNG (1×1 transparent pixel) as a data URI, used for icon upload tests
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("AI Controls admin settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  });

  describe("Feature Access page", () => {
    it("should display the AI feature access table with groups and save a permission change", () => {
      cy.intercept("GET", "/api/ee/ai-controls/permissions").as(
        "getPermissions",
      );
      cy.intercept("PUT", "/api/ee/ai-controls/permissions").as(
        "updatePermissions",
      );

      cy.visit("/admin/metabot/1/usage-controls/ai-feature-access");

      cy.wait("@getPermissions");

      cy.findByTestId("ai-feature-access-table").should("be.visible");

      // Verify column headers
      cy.findByTestId("ai-feature-access-table").within(() => {
        cy.findByText("AI features").should("be.visible");
        cy.findByText("Chat and NLQ").should("be.visible");
        cy.findByText("SQL generation").should("be.visible");
        cy.findByText("Other tools").should("be.visible");
      });

      // Admins row should be locked/checked
      cy.findByRole("row", { name: /Administrators permissions/ }).within(
        () => {
          cy.findByRole("switch").should("be.checked").and("be.disabled");
        },
      );

      // All Users row should have the metabot switch checked (default is yes)
      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        // Toggle the metabot AI features switch off
        cy.findByRole("switch").should("be.checked").click({ force: true });
      });

      // Wait for the debounced PUT request to complete
      cy.wait("@updatePermissions")
        .its("response.statusCode")
        .should("eq", 200);

      // Verify sub-permission checkboxes are now disabled after disabling metabot
      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        cy.findByRole("switch").should("not.be.checked");
        cy.findAllByRole("checkbox").each(($checkbox) => {
          cy.wrap($checkbox).should("be.disabled");
        });
      });
    });
  });

  describe("Customization page", () => {
    it("should save a custom Metabot name", () => {
      cy.intercept("PUT", "/api/setting/metabot-name").as("saveName");

      cy.visit("/admin/metabot/1/customization");

      cy.findByRole("heading", { name: "Customization", level: 1 }).should(
        "be.visible",
      );
      cy.findByLabelText("Metabot's name")
        .should("be.visible")
        .clear()
        .type("HAL 9000");

      // Wait for debounced save
      cy.wait("@saveName").its("response.statusCode").should("eq", 204);

      // Reload and verify persistence
      cy.reload();
      cy.findByLabelText("Metabot's name").should("have.value", "HAL 9000");
    });

    it("should upload a custom Metabot icon and show the illustrations section", () => {
      cy.intercept("PUT", "/api/setting/metabot-icon").as("saveIcon");

      cy.visit("/admin/metabot/1/customization");

      H.main().findByText("Metabot's icon").should("be.visible");
      cy.findByRole("button", { name: "Upload a custom icon" }).should(
        "be.visible",
      );

      // The illustrations section is hidden until a custom icon is set
      H.main().findByText("Metabot illustrations").should("not.exist");

      // Upload a tiny PNG via the hidden file input
      cy.get('input[type="file"]').selectFile(
        {
          contents: Cypress.Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
          ),
          fileName: "metabot-icon.png",
          mimeType: "image/png",
        },
        { force: true },
      );

      cy.wait("@saveIcon").its("response.statusCode").should("eq", 204);

      // The illustrations section should now appear
      H.main().findByText("Metabot illustrations").should("be.visible");
      cy.findByRole("switch", { name: /Show Metabot illustrations/ })
        .parent()
        .should("be.visible");

      // The "Remove custom icon" button should be visible
      cy.findByLabelText("Remove custom icon").should("be.visible");
    });

    it("should hide Metabot illustrations when the toggle is switched off", () => {
      // Set a custom icon via API so the illustrations toggle is visible
      H.updateEnterpriseSettings({
        "metabot-icon": TINY_PNG_DATA_URI,
        "metabot-show-illustrations": true,
      });
      H.updateSetting("metabot-enabled?", true);

      cy.intercept("PUT", "/api/setting/metabot-show-illustrations").as(
        "saveIllustrations",
      );

      cy.visit("/admin/metabot/1/customization");

      H.main().findByText("Metabot illustrations").should("be.visible");

      // The switch should be ON
      cy.findByRole("switch", { name: "Show Metabot illustrations" }).should(
        "have.attr",
        "data-checked",
        "true",
      );

      // Toggle illustrations off
      cy.findByRole("switch", {
        name: "Show Metabot illustrations",
      }).click({ force: true });

      cy.wait("@saveIllustrations")
        .its("response.statusCode")
        .should("eq", 204);

      // Navigate to the home page and open Metabot chat to verify illustrations are hidden
      cy.visit("/");
      // Can't use H.openMetabotViaSearchButton() because custom icon replaces .Icon-metabot
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .click();

      cy.findByTestId("metabot-empty-chat-info").should("be.visible");
      // The SVG illustration should NOT be rendered when showIllustrations=false
      cy.findByTestId("metabot-empty-chat-info")
        .find("svg")
        .should("not.exist");
      // But the hint text should still be visible
      cy.findByTestId("metabot-empty-chat-info")
        .findByText(/I can help you/)
        .should("be.visible");
    });
  });

  describe("System Prompts pages", () => {
    it("should save a custom Metabot chat system prompt", () => {
      cy.intercept("PUT", "/api/setting/metabot-chat-system-prompt").as(
        "savePrompt",
      );

      cy.visit("/admin/metabot/1/system-prompts/metabot-chat");

      cy.findByRole("heading", {
        name: "Metabot chat prompt instructions",
        level: 1,
      }).should("be.visible");

      cy.findByRole("textbox", { name: /Metabot chat prompt instructions/ })
        .should("be.visible")
        .click()
        .type("Be concise and helpful.");

      cy.wait("@savePrompt").its("response.statusCode").should("eq", 204);

      // Reload and verify persistence
      cy.reload();
      cy.findByRole("textbox", {
        name: /Metabot chat prompt instructions/,
      }).should("contain.value", "Be concise and helpful.");
    });

    it("should save a custom SQL generation system prompt", () => {
      cy.intercept("PUT", "/api/setting/metabot-sql-system-prompt").as(
        "saveSqlPrompt",
      );

      cy.visit("/admin/metabot/1/system-prompts/sql-generation");

      cy.findByRole("heading", {
        name: "SQL generation prompt instructions",
        level: 1,
      }).should("be.visible");

      cy.findByRole("textbox", {
        name: /SQL generation prompt instructions/,
      })
        .should("be.visible")
        .click()
        .type("Always use uppercase SQL keywords.");

      cy.wait("@saveSqlPrompt").its("response.statusCode").should("eq", 204);

      cy.reload();
      cy.findByRole("textbox", {
        name: /SQL generation prompt instructions/,
      }).should("contain.value", "Always use uppercase SQL keywords.");
    });
  });

  describe("Metabot access controls", () => {
    it("should not show the Metabot chat icon for users in a group without Metabot access", () => {
      // First, get the current permissions so we can update only the All Users group
      cy.request("GET", "/api/ee/ai-controls/permissions").then((response) => {
        const currentPermissions: Array<{
          group_id: number;
          perm_type: string;
          perm_value: string;
        }> = response.body.permissions;

        // Set All Users group's metabot permission to "no"
        const updatedPermissions = currentPermissions.map((p) => {
          if (
            p.group_id === ALL_USERS_GROUP_ID &&
            p.perm_type === "permission/metabot"
          ) {
            return { ...p, perm_value: "no" };
          }
          return p;
        });

        cy.request("PUT", "/api/ee/ai-controls/permissions", {
          permissions: updatedPermissions,
        });
      });

      // Sign in as a normal user (who is only in the All Users group)
      cy.signInAsNormalUser();
      cy.visit("/");

      // Wait for the navigation bar to be present
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The Metabot chat icon should not be present
      H.appBar().find('[aria-label*="Chat with"]').should("not.exist");
    });

    it("should show the custom Metabot name in the app bar button tooltip", () => {
      H.updateSetting("metabot-name", "Aria");

      cy.visit("/");
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The app bar button tooltip/aria-label should reflect the custom name
      H.appBar()
        .findByRole("button", { name: /Chat with Aria/ })
        .should("be.visible");
    });

    it("should show a custom Metabot icon in the app bar when metabot-icon is set", () => {
      H.updateEnterpriseSettings({ "metabot-icon": TINY_PNG_DATA_URI });

      cy.visit("/");
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The custom icon img should be rendered (alt = metabot name)
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .within(() => {
          // When a custom icon is set, MetabotIcon renders an <img> with alt = metabotName
          cy.get("img").should("be.visible");
        });
    });
  });
});
