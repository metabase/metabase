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
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  it("shows most recent dashboard from the activity log", () => {
    const dashboardName = "Orders in a dashboard";

    cy.visit("/embed/new");
    cy.wait("@dashboard");

    cy.log("assert that the most recent dashboard is the one we expect");
    cy.get<RecentActivityIntercept>("@recentActivity").should((intercept) => {
      const mostRecentDashboard = intercept.response?.body.recents?.filter(
        (recent) => recent.model === "dashboard",
      )?.[0];

      expect(mostRecentDashboard.name).to.be.equal(dashboardName);
    });

    H.getIframeBody().within(() => {
      cy.log("dashboard title is visible");
      cy.findByText(dashboardName).should("be.visible");

      cy.log("dashboard card is visible");
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("shows chart experience when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Chart").click();

    H.getIframeBody().within(() => {
      cy.log("question title is visible");
      cy.findByText("Query log").should("be.visible");
    });
  });

  it("shows exploration template when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Exploration").click();

    H.getIframeBody().within(() => {
      cy.log("data picker is visible");
      cy.findByText("Pick your starting data").should("be.visible");
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

  describe("Step 2: Select embed experience with empty activity log", () => {
    beforeEach(() => {
      // Mock empty activity log
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [],
      }).as("emptyRecentItems");
    });

    it("shows example dashboard when activity log is empty", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Should show dashboard experience by default
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.log("example dashboard is visible");
        cy.findByText("Person overview").should("be.visible");
        cy.findByText("Person detail").should("be.visible");
      });
    });

    it("shows example question when activity log is empty and chart experience is selected", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Switch to chart experience
      getEmbedSidebar().findByText("Chart").click();

      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.log("example question is visible");
        cy.findByText("Query log").should("be.visible");
      });
    });
  });
});

const getEmbedSidebar = () => cy.findByRole("complementary");
