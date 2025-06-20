const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > select embed experience", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("GET", "/api/activity/recents?*").as("recentItems");
  });

  it("shows dashboard experience by default", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    const iframe = H.getIframeBody();
    iframe.within(() => {
      cy.log("dashboard title is visible");
      cy.findByText("Person overview").should("be.visible");

      cy.log("dashboard card is visible");
      cy.findByText("Person detail").should("be.visible");
    });
  });

  it("shows chart experience when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Chart").click();

    const iframe = H.getIframeBody();
    iframe.within(() => {
      cy.log("question title is visible");
      cy.findByText("Query log").should("be.visible");
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
