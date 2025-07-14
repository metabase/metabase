import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  assertDashboard,
  assertRecentItemName,
  getEmbedSidebar,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed experience";

H.describeWithSnowplow(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();

    cy.intercept("GET", "/api/dashboard/*").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("select embed experiences with a non-empty activity log", () => {
    it("shows the most recent dashboard from the activity log by default", () => {
      const dashboardName = "Orders in a dashboard";

      visitNewEmbedPage();
      assertRecentItemName("dashboard", dashboardName);

      H.getIframeBody().within(() => {
        cy.log("dashboard title is visible");
        cy.findByText(dashboardName).should("be.visible");

        cy.log("dashboard card is visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("shows the most recent question from the activity log when selected", () => {
      const questionName = "Orders, Count";

      cy.log("go to a question to add to the activity log");
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.wait("@cardQuery");

      visitNewEmbedPage();
      assertRecentItemName("card", questionName);

      getEmbedSidebar().findByText("Chart").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_selected",
        event_detail: "chart",
      });

      cy.wait("@cardQuery");

      H.getIframeBody().within(() => {
        cy.log("question title is visible");
        cy.findByText(questionName).should("be.visible");
      });
    });

    it("shows exploration template when selected", () => {
      visitNewEmbedPage();
      getEmbedSidebar().findByText("Exploration").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_selected",
        event_detail: "exploration",
      });

      H.getIframeBody().within(() => {
        cy.log("data picker is visible");
        cy.findByText("Pick your starting data").should("be.visible");
      });
    });
  });

  describe("select embed experiences with an empty activity log", () => {
    beforeEach(() => {
      cy.log("simulate an empty activity log");
      cy.intercept("GET", "/api/activity/recents?*", { recents: [] }).as(
        "emptyRecentItems",
      );
    });

    it("shows dashboard of id=1 when activity log is empty", () => {
      visitNewEmbedPage();
      assertDashboard({ id: 1, name: "Person overview" });
      cy.wait("@emptyRecentItems");

      cy.log("dashboard title and card of id=1 should be visible");
      H.getIframeBody().within(() => {
        cy.findByText("Person overview").should("be.visible");
        cy.findByText("Person detail").should("be.visible");
      });
    });

    it("shows question of id=1 when activity log is empty and chart is selected", () => {
      visitNewEmbedPage();
      cy.wait("@emptyRecentItems");

      getEmbedSidebar().findByText("Chart").click();

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_experience_selected",
        event_detail: "chart",
      });

      H.getIframeBody().within(() => {
        cy.log("question title of id=1 is visible");
        cy.findByText("Query log").should("be.visible");
      });
    });
  });

  it("localizes the iframe preview when ?locale is passed", () => {
    cy.visit("/embed-iframe?locale=fr");
    cy.wait("@dashboard");

    // TODO: update this test once "Exploration" is localized in french.
    getEmbedSidebar().findByText("Exploration").click();

    H.getIframeBody().within(() => {
      cy.log("data picker is localized");
      cy.findByText("Choisissez vos données de départ").should("be.visible");
    });
  });
});
