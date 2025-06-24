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
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  describe("select embed experiences with a non-empty activity log", () => {
    it("shows the most recent dashboard from the activity log by default", () => {
      const dashboardName = "Orders in a dashboard";

      visitNewEmbedPage();

      cy.log("assert that the most recent dashboard is the one we expect");
      cy.get<RecentActivityIntercept>("@recentActivity").should((intercept) => {
        const recentItem = intercept.response?.body.recents?.filter(
          (recent) => recent.model === "dashboard",
        )?.[0];

        expect(recentItem.name).to.be.equal(dashboardName);
      });

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
      cy.visit(`/question/${ORDERS_COUNT_QUESTION_ID}`);
      cy.wait("@cardQuery");

      visitNewEmbedPage();

      cy.log("assert that the most recent dashboard is the one we expect");
      cy.get<RecentActivityIntercept>("@recentActivity").should((intercept) => {
        const recentItem = intercept.response?.body.recents?.filter(
          (recent) => recent.model === "card",
        )?.[0];

        expect(recentItem.name).to.be.equal(questionName);
      });

      getEmbedSidebar().findByText("Chart").click();
      cy.wait("@cardQuery");

      H.getIframeBody().within(() => {
        cy.log("question title is visible");
        cy.findByText(questionName).should("be.visible");
      });
    });

    it("shows exploration template when selected", () => {
      visitNewEmbedPage();
      getEmbedSidebar().findByText("Exploration").click();

      H.getIframeBody().within(() => {
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
      visitNewEmbedPage();
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

      H.getIframeBody().within(() => {
        cy.log("question title of id=1 is visible");
        cy.findByText("Query log").should("be.visible");
      });
    });
  });
});

const getEmbedSidebar = () => cy.findByRole("complementary");

const visitNewEmbedPage = () => {
  cy.visit("/embed/new");
  cy.wait("@dashboard");
};
