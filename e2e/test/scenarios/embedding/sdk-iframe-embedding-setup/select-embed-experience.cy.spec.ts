import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { RecentItem } from "metabase-types/api";

const { H } = cy;

type RecentActivityIntercept = {
  response: { body: { recents: RecentItem[] } };
};

describe("scenarios > embedding > sdk iframe embed setup > select embed experience", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  describe("select embed experiences with a non-empty activity log", () => {
    it("shows the most recent dashboard from the activity log by default", () => {
      const dashboardName = "Orders in a dashboard";

      cy.visit("/embed/new");
      cy.wait("@dashboard");

      cy.log("assert that the most recent dashboard is the one we expect");
      cy.get<RecentActivityIntercept>("@recentActivity").should((intercept) => {
        const recentItem = intercept.response?.body.recents?.filter(
          (recent) => recent.model === "dashboard",
        )?.[0];

        expect(recentItem.name).to.be.equal(dashboardName);
      });

      const iframe = H.getIframeBody();
      iframe.within(() => {
        cy.log("dashboard title is visible");
        cy.findByText(dashboardName).should("be.visible");

        cy.log("dashboard card is visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("shows the most recent question from the activity log when selected", () => {
      cy.log("go to a question to add to the activity log");
      cy.visit(`/question/${ORDERS_COUNT_QUESTION_ID}`);
      cy.wait("@cardQuery");

      cy.visit("/embed/new");
      cy.wait("@dashboard");

      getEmbedSidebar().findByText("Chart").click();
      cy.wait("@cardQuery");

      const iframe = H.getIframeBody();
      iframe.within(() => {
        cy.log("question title is visible");
        cy.findByText("Orders, Count").should("be.visible");
      });
    });

    it("shows exploration template when selected", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      getEmbedSidebar().findByText("Exploration").click();

      const iframe = H.getIframeBody();
      iframe.within(() => {
        cy.log("data picker is visible");
        cy.findByText("Pick your starting data").should("be.visible");
      });
    });
  });

  describe("select embed experiences with an empty activity log", () => {
    beforeEach(() => {
      // simulate a totally empty activity log
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [],
      }).as("emptyRecentItems");
    });

    it("shows dashboard of id=1 when activity log is empty", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      cy.log("dashboard title and card of id=1 should be visible");
      H.getIframeBody().within(() => {
        cy.findByText("Person overview").should("be.visible");
        cy.findByText("Person detail").should("be.visible");
      });
    });

    it("shows question of id=1 when activity log is empty and chart is selected", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      getEmbedSidebar().findByText("Chart").click();

      H.getIframeBody().within(() => {
        cy.log("question title of id=1 is visible");
        cy.findByText("Query log").should("be.visible");
      });
    });
  });

  it("localizes the iframe preview when ?locale is passed", () => {
    cy.visit("/embed/new?locale=fr");
    cy.wait("@dashboard");

    // TODO: update this test once "Exploration" is localized in french.
    getEmbedSidebar().findByText("Exploration").click();

    H.getIframeBody().within(() => {
      cy.log("data picker is localized");
      cy.findByText("Choisissez vos données de départ").should("be.visible");
    });
  });
});

const getEmbedSidebar = () => cy.findByRole("complementary");
