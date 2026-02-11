const { H } = cy;
import type { ChecklistItemValue } from "metabase/home/components/Onboarding/types";

describe("Onboarding checklist page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.visit("/getting-started");
  });

  it("should let non-admins access this page", () => {
    cy.get("[data-accordion=true]").within(() => {
      cy.findByRole("heading", { name: "Start visualizing your data" }).should(
        "be.visible",
      );
      cy.contains(
        "Hover over a table and click the yellow lightning bolt",
      ).should("be.visible");

      cy.findByText("Make an interactive chart with the query builder").click();
      cy.contains(
        "Filter and summarize data, add custom columns, join data from other tables, and more",
      ).should("be.visible");
      cy.contains(
        "Hover over a table and click the yellow lightning bolt",
      ).should("not.be.visible");
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
        "x-ray",
        "notebook",
        "sql",
        "dashboard",
        "subscription",
        "alert",
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

      cy.findByTestId("database-cta").button("Add Database").click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "database",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-item").click();
      cy.findByTestId("invite-cta").button("Invite people").click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-cta").button("Set up Single Sign-on").click();
      H.expectUnstructuredSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "secondary",
      });
    });
  });
});
