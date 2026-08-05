const { H } = cy;

/**
 * The embedding hub at `/embedding` -- the seven-tab section, not the older
 * onboarding checklist that `embedding-hub/embedding-hub.cy.spec.ts` covers.
 *
 * Deliberately thin: the tab bodies are unit-tested next to their components.
 * What is here is what needs a real browser -- that a route fragment written
 * for admin renders correctly at a second path, and that its links do not
 * escape back into admin.
 */
describe("scenarios > embedding > embedding hub", () => {
  describe("pro", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("reaches all seven tabs from the nav", () => {
      cy.visit("/embedding");

      const tabs = [
        { label: "Get started", path: "/embedding" },
        { label: "Security", path: "/embedding/security" },
        { label: "Authentication", path: "/embedding/authentication" },
        { label: "Permissions", path: "/embedding/permissions" },
        { label: "Tenancy", path: "/embedding/tenancy" },
        { label: "Appearance", path: "/embedding/appearance" },
        { label: "Localization", path: "/embedding/localization" },
      ];

      tabs.forEach(({ label, path }) => {
        cy.log(`Open the ${label} tab`);
        cy.findByTestId("embedding-hub-nav")
          .findByRole("link", { name: label })
          .click();

        cy.url().should("include", path);
      });
    });

    it("keeps the permissions editor's links inside the hub", () => {
      H.updateSetting("use-tenants", true);

      cy.visit("/embedding/permissions");

      cy.log("The editor renders at the hub's path, not admin's");
      cy.url().should("include", "/embedding/permissions");

      cy.log("Drilling into a group stays in the hub");
      cy.findByTestId("permission-table").findAllByRole("link").first().click();

      cy.url().should("include", "/embedding/permissions");
      cy.url().should("not.include", "/admin/permissions");
    });

    it("lists published guest embeds even after guest embeds are switched off", () => {
      cy.log("Publish a dashboard as a guest embed");
      H.createDashboard({ name: "Published dashboard" }).then(
        ({ body: dashboard }) => {
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
          });
        },
      );

      H.updateSetting("enable-embedding-static", true);
      cy.visit("/embedding/security");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Published guest embeds").should("be.visible");
        cy.findByText("Published dashboard").should("be.visible");
      });

      cy.log(
        "Turning guest embeds off is exactly when an admin needs to audit what is already out there",
      );
      H.updateSetting("enable-embedding-static", false);
      cy.visit("/embedding/security");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Published guest embeds").should("be.visible");
        cy.findByText("Published dashboard").should("be.visible");
      });
    });
  });

  describe("oss", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("shows every tab, with a gem on the paid ones", () => {
      cy.visit("/embedding");

      cy.findByTestId("embedding-hub-nav").within(() => {
        cy.log("Paid tabs carry the gem");
        ["Authentication", "Tenancy", "Appearance", "Localization"].forEach(
          (label) => {
            cy.findByRole("link", { name: label })
              .findByTestId("upsell-gem")
              .should("exist");
          },
        );

        cy.log("Permissions works on OSS, so it carries none");
        cy.findByRole("link", { name: "Permissions" })
          .findByTestId("upsell-gem")
          .should("not.exist");
      });
    });

    it("upsells rather than hiding a paid tab", () => {
      cy.visit("/embedding/localization");

      cy.findByTestId("embedding-hub-main")
        .findByText("Translate your embedded content")
        .should("be.visible");
    });
  });
});
