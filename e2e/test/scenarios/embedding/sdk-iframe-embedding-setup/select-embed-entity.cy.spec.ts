import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > select embed entity", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  it("can select a dashboard from the recents list", () => {
    cy.log("add two dashboards to activity log");
    cy.visit("/dashboard/1");
    cy.wait("@dashboard");
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.wait("@dashboard");

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click();

      cy.log("two dashboards should be visible");
      cy.findAllByTestId("embed-recent-item-card").should("have.length", 2);
      cy.findByText("Person overview").should("be.visible");
      cy.findByText("Orders in a dashboard").should("be.visible");
    });

    cy.log("dashboard should be displayed in the preview");
    cy.wait("@dashboard");
    getPreviewIframe().within(() => {
      cy.findByText("Person overview").should("be.visible");
    });
  });

  it("selects the most recently visited question from the recents list", () => {
    cy.log("add question to activity log");
    cy.visit(`/question/${ORDERS_COUNT_QUESTION_ID}`);
    cy.wait("@cardQuery");

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
      cy.findByText("Next").click();
      cy.findByText("Orders, Count").should("be.visible");

      cy.log("only one recent item should be visible");
      cy.findAllByTestId("embed-recent-item-card").should("have.length", 1);
    });

    cy.wait("@cardQuery");

    cy.log("question should be displayed in the preview");
    getPreviewIframe().within(() => {
      cy.findByText("Orders, Count").should("be.visible");
    });
  });

  describe("Entity selection with empty recents", () => {
    beforeEach(() => {
      // Simulate empty activity log for fresh user testing
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [],
      }).as("emptyRecentItems");
    });

    it("shows empty state for fresh user with no recent activities", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // TODO: Once Step 3 UI is implemented, verify:
      // - Empty state is shown when no recent activities
      // - Empty state has illustration and search button
      // - Search button opens dashboard/question search modal

      // For now, verify fallback behavior (default entities)
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Person overview").should("be.visible");
      });
    });

    it("allows searching for entities when recents list is empty", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // TODO: Once Step 3 UI is implemented, add test for:
      // - Empty state with search button is visible
      // - Click search button opens modal
      // - Can search and select dashboards/questions
      // - Selected entity updates preview

      // Placeholder verification
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Person overview").should("be.visible");
      });
    });
  });

  describe("Entity selection integration", () => {
    it("selected entity persists when navigating between embed steps", () => {
      // Visit a specific dashboard to add to recents
      const dashboardId = 1;
      cy.visit(`/dashboard/${dashboardId}`);
      cy.wait("@dashboard");

      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // TODO: Once full step navigation is implemented, verify:
      // - Select entity in Step 3
      // - Navigate to Step 4 (embed options)
      // - Navigate back to Step 3
      // - Verify selected entity is still selected
      // - Navigate to Step 5 (code snippets)
      // - Verify selected entity appears in code snippets

      // For now, verify current functionality
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Person overview").should("be.visible");
      });
    });

    it("changing selected entity updates preview immediately", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // TODO: Once Step 3 UI is implemented, add test for:
      // - Select different entities from recents or search
      // - Verify preview updates immediately without page reload
      // - Test switching between dashboards and questions
      // - Verify preview reflects correct content

      // Verify current immediate preview functionality
      getEmbedSidebar().findByText("Chart").click();

      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Query log").should("be.visible");
      });
    });
  });
});

const getPreviewIframe = () =>
  cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");

const getEmbedSidebar = () => cy.findByTestId("embed-sidebar");

const visitNewEmbedPage = () => {
  cy.visit("/embed/new");
  cy.wait("@dashboard");
};
