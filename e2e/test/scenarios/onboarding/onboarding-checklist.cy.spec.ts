const { H } = cy;
import type { ChecklistItemValue } from "metabase/redux/store";

describe("Onboarding checklist page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.visit("/getting-started");
  });

  it("should let non-admins access this page", () => {
    cy.get("[data-accordion=true]").within(() => {
      cy.findByRole("heading", { name: "Explore your data" }).should(
        "be.visible",
      );
      cy.contains("to create a question in natural language").should(
        "be.visible",
      );

      cy.findByTestId("dashboard-item").click();
      cy.contains(
        "You can present questions, text, and links on a dashboard",
      ).should("be.visible");
      cy.contains("to create a question in natural language").should(
        "not.be.visible",
      );
    });
  });
});

describe("Inaccessible Onboarding checklist", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should not render when embedded in an iframe", () => {
    H.visitFullAppEmbeddingUrl({ url: "/", qs: {} });
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByRole("listitem", { name: "Home" }).should("be.visible");
      cy.findByRole("listitem", { name: "How to use Metabase" }).should(
        "not.exist",
      );
    });

    cy.log("Redirects to the home page");
    H.visitFullAppEmbeddingUrl({ url: "/getting-started", qs: {} });
    cy.location("pathname").should("eq", "/");
  });

  it("should not render when the instance is whitelabelled", () => {
    H.updateSetting("application-name", "Acme, corp.");

    cy.visit("/");
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByRole("listitem", { name: "Home" }).should("be.visible");
      cy.findByRole("listitem", { name: "How to use Metabase" }).should(
        "not.exist",
      );
    });

    cy.log("Redirects to the home page");
    cy.visit("/getting-started");
    cy.location("pathname").should("eq", "/");

    cy.log("The link should not exist in the main settings menu either");
    cy.findByLabelText("Settings menu").click();
    H.popover().findByText("Help").click();

    cy.findByTestId("help-submenu")
      .should("contain", "About Acme, corp.")
      .and("not.contain", "How to use Metabase");
  });
});

describe("Onboarding checklist events", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.updateSetting("ai-features-enabled?", true);

    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it('should track clicking on "How to use Metabase" button', () => {
    cy.visit("/");
    cy.findByTestId("main-navbar-root")
      .findByRole("listitem", { name: "How to use Metabase" })
      .click();
    cy.location("pathname").should("eq", "/getting-started");
    H.expectUnstructuredSnowplowEvent({
      event: "onboarding_checklist_opened",
    });
  });

  describe("Onboarding checklist page", () => {
    it("should track each item when expanded", () => {
      const items: ChecklistItemValue[] = [
        "invite",
        "database",
        "ai",
        "query",
        "dashboard",
        "alert",
        "data-studio",
        "permissions",
      ];

      cy.visit("/getting-started");

      items.forEach((i) => {
        cy.findByTestId(`${i}-item`).click();
        H.expectUnstructuredSnowplowEvent({
          event: "onboarding_checklist_item_expanded",
          triggered_from: i,
        });
      });
    });

    it("should track individual items' cta(s) when clicked", () => {
      cy.visit("/getting-started");
      // Not strictly necessary but reduces the flakiness by allowing the page to load fully
      cy.findByTestId("main-navbar-root")
        .findByRole("listitem", {
          name: "How to use Metabase",
        })
        .should("have.attr", "aria-selected", "true");

      cy.findByTestId("database-cta")
        .findByRole("link", { name: "Add database" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "database",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-item").click();
      cy.findByTestId("invite-cta")
        .findByRole("link", { name: "Invite people" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-cta")
        .findByRole("link", { name: "Set up single sign-on" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "secondary",
      });

      cy.go("back");

      cy.findByTestId("ai-item").click();
      cy.findByTestId("ai-cta").button("Connect to an AI provider").click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "ai",
        event_detail: "primary",
      });

      // This CTA opens a modal instead of navigating, so dismiss it in place.
      // Wait for it to unmount before clicking on: while it fades out, its
      // overlay still covers the CTA underneath.
      cy.findByTestId("ai-provider-configuration-modal")
        .findByLabelText("Close")
        .click();
      cy.findByTestId("ai-provider-configuration-modal").should("not.exist");

      cy.findByTestId("ai-cta")
        .findByRole("link", { name: "Set up MCP" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "ai",
        event_detail: "secondary",
      });

      cy.go("back");

      cy.findByTestId("dashboard-item").click();
      cy.findByTestId("dashboard-cta").button("Create a dashboard").click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "dashboard",
        event_detail: "primary",
      });

      cy.findByTestId("new-dashboard-modal").findByLabelText("Close").click();
      cy.findByTestId("new-dashboard-modal").should("not.exist");

      cy.findByTestId("data-studio-item").click();
      cy.findByTestId("data-studio-cta")
        .findByRole("link", { name: "Go to Data studio" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "data-studio",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("permissions-item").click();
      cy.findByTestId("permissions-cta")
        .findByRole("link", { name: "Go to permissions" })
        .click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "permissions",
        event_detail: "primary",
      });
    });
  });
});
