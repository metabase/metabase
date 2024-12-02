import {
  describeEE,
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
  setTokenFeatures,
  updateSetting,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import type { ChecklistItemValue } from "metabase/home/components/Onboarding/types";

describe("Onboarding checklist page", () => {
  beforeEach(() => {
    restore();
  });

  it("should let non-admins access this page", () => {
    cy.signInAsNormalUser();
    cy.visit("/getting-started");

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
      ).should("not.exist");
    });
  });
});

describeEE("Inaccessible Onboarding checklist", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should not render when embedded in an iframe or when the instance is whitelabelled", () => {
    visitFullAppEmbeddingUrl({ url: "/", qs: {} });
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByRole("listitem", { name: "Home" }).should("be.visible");
      cy.findByRole("listitem", { name: "How to use Metabase" }).should(
        "not.exist",
      );
    });

    cy.log("Redirects to the home page");
    visitFullAppEmbeddingUrl({ url: "/getting-started", qs: {} });
    cy.location("pathname").should("eq", "/");
  });

  it("should not render when the instance is whitelabelled", () => {
    updateSetting("application-name", "Acme, corp.");

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
  });
});

describeWithSnowplow("Onboarding checklist events", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    resetSnowplow();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it('should track clicking on "How to use Metabase" button', () => {
    cy.visit("/");
    cy.findByTestId("main-navbar-root")
      .findByRole("listitem", { name: "How to use Metabase" })
      .click();
    cy.location("pathname").should("eq", "/getting-started");
    expectGoodSnowplowEvent({
      event: "onboarding_checklist_opened",
    });
  });

  describe("Onboarding checklist page", () => {
    it("should track each item when expanded", () => {
      const PAGE_VIEW = 1;
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
      cy.log(
        "The default open accordion item is not tracked - only the page view is",
      );
      expectGoodSnowplowEvents(PAGE_VIEW);

      items.forEach(i => {
        cy.findByTestId(`${i}-item`).click();
        expectGoodSnowplowEvent({
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
      expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "database",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-item").click();
      cy.findByTestId("invite-cta").button("Invite people").click();
      expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-cta").button("Set up Single Sign-on").click();
      expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "secondary",
      });
    });
  });
});
