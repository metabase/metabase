import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding setup > select embed entity", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  describe("Selecting entities to embed", () => {
    it("shows most recently visited dashboard in the recents list", () => {
      cy.log("add dashboard to activity log");
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
      cy.wait("@dashboard");

      visitNewEmbedPage();

      getEmbedSidebar().within(() => {
        cy.findByText("Next").click();
        cy.findByText("Orders in a dashboard").should("be.visible");

        cy.log("only one recent item should be visible");
        cy.findAllByTestId("embed-recent-item-card").should("have.length", 1);
      });

      cy.log("dashboard should be displayed in the preview");
      cy.wait("@dashboard");
      getPreviewIframe().within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
      });
    });

    it("shows most recently visited question in the recents list", () => {
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

    it("selecting a dashboard from recents changes the preview to that dashboard", () => {
      // Visit a specific dashboard to ensure it's in recents
      const dashboardId = 1;
      cy.visit(`/dashboard/${dashboardId}`);
      cy.wait("@dashboard");

      // Navigate to embed page
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // TODO: Once Step 3 UI is implemented, add test for:
      // - Click on recent dashboard in the recents list
      // - Verify preview updates to show the selected dashboard

      // For now, verify the most recent dashboard is displayed
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Person overview").should("be.visible");
      });
    });

    it("clicking on the search icon and selecting a dashboard changes the preview to that dashboard", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // TODO: Once Step 3 UI is implemented, add test for:
      // - Click on search icon
      // - Search modal opens
      // - Search for a specific dashboard
      // - Select dashboard from search results
      // - Verify preview updates to show the selected dashboard

      // For now, verify current dashboard preview functionality
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Person overview").should("be.visible");
      });
    });

    it("clicking on the search icon and selecting a question changes the preview to that question", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // Switch to Chart template
      getEmbedSidebar().findByText("Chart").click();

      // TODO: Once Step 3 UI is implemented, add test for:
      // - Click on search icon
      // - Search modal opens
      // - Search for a specific question
      // - Select question from search results
      // - Verify preview updates to show the selected question

      // For now, verify current question preview functionality
      const iframe = getPreviewIframe();
      iframe.within(() => {
        // Default question when no recents available
        cy.findByText("Query log").should("be.visible");
      });
    });

    it("exploration template skips entity selection step", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");

      // Select exploration template
      getEmbedSidebar().findByText("Exploration").click();

      // Verify exploration content is shown directly (no entity selection step)
      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.findByText("Pick your starting data").should("be.visible");
      });

      // TODO: Once step navigation is fully implemented, verify that
      // Step 3 (entity selection) is skipped for exploration template
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
