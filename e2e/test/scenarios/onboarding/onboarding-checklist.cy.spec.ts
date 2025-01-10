import { H } from "e2e/support";
import type { ChecklistItemValue } from "metabase/home/components/Onboarding/types";

H.describeEE("Onboarding checklist page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
  });

  it("should not render when embedded in an iframe or when the instance is whitelabelled", () => {
    H.visitFullAppEmbeddingUrl({ url: "/", qs: {} });
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByRole("listitem", { name: "Home" }).should("be.visible");
      cy.findByRole("listitem", { name: "How to use Metabase" }).should(
        "not.exist",
      );
    });

    H.updateSetting("application-name", "Acme, corp.");
    cy.visit("/");
    cy.findByTestId("main-navbar-root").within(() => {
      cy.findByRole("listitem", { name: "Home" }).should("be.visible");
      cy.findByRole("listitem", { name: "How to use Metabase" }).should(
        "not.exist",
      );
    });
  });
});

H.describeWithSnowplow("Onboarding checklist events", () => {
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
    H.expectGoodSnowplowEvent({
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
      H.expectGoodSnowplowEvents(PAGE_VIEW);

      items.forEach(i => {
        cy.findByTestId(`${i}-item`).click();
        H.expectGoodSnowplowEvent({
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
      H.expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "database",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-item").click();
      cy.findByTestId("invite-cta").button("Invite people").click();
      H.expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "primary",
      });

      cy.go("back");

      cy.findByTestId("invite-cta").button("Set up Single Sign-on").click();
      H.expectGoodSnowplowEvent({
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "secondary",
      });
    });
  });
});
