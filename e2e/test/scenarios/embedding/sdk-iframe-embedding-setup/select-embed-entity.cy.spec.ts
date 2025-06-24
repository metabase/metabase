import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  getEmbedSidebar,
  getPreviewIframe,
  getRecentItemCards,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const FIRST_DASHBOARD_NAME = "Orders in a dashboard";
const SECOND_DASHBOARD_NAME = "Acme Inc";
const FIRST_QUESTION_NAME = "Orders, Count";
const SECOND_QUESTION_NAME = "Orders, Count, Grouped by Created At (year)";

describe("scenarios > embedding > sdk iframe embed setup > select embed entity", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    H.createDashboard({ name: SECOND_DASHBOARD_NAME }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("secondDashboardId");
      },
    );

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  it("can select a recent dashboard to embed", () => {
    cy.log("add two dashboards to activity log");
    H.visitDashboard("@secondDashboardId");
    cy.wait("@dashboard");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@dashboard");

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click();
      cy.findByText("Select a dashboard to embed").should("be.visible");

      cy.log("first dashboard should be selected by default");
      getRecentItemCards()
        .should("have.length", 2)
        .first()
        .should("have.attr", "data-selected", "true");

      cy.findByText(FIRST_DASHBOARD_NAME).should("be.visible");
      cy.findByText(SECOND_DASHBOARD_NAME).should("be.visible");

      cy.log("second dashboard can be selected");
      cy.findByText(SECOND_DASHBOARD_NAME).click();
      getRecentItemCards().eq(1).should("have.attr", "data-selected", "true");
    });

    cy.log("selected dashboard should be shown in the preview");
    cy.wait("@dashboard");
    getPreviewIframe().within(() => {
      cy.findByText(SECOND_DASHBOARD_NAME).should("be.visible");
    });
  });

  it("can select a recent question to embed", () => {
    cy.log("add two questions to activity log");
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    cy.wait("@cardQuery");
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    cy.wait("@cardQuery");

    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
      cy.findByText("Next").click();

      cy.findByText("Select a chart to embed").should("be.visible");

      cy.log("first question should be selected by default");
      getRecentItemCards()
        .should("have.length", 2)
        .first()
        .should("have.attr", "data-selected", "true");

      cy.findByText(FIRST_QUESTION_NAME).should("be.visible");
      cy.findByText(SECOND_QUESTION_NAME).should("be.visible");

      cy.log("second question can be selected");
      cy.findByText(SECOND_QUESTION_NAME).click();
      getRecentItemCards().eq(1).should("have.attr", "data-selected", "true");
    });

    cy.log("selected question should be shown in the preview");
    cy.wait("@cardQuery");
    getPreviewIframe().within(() => {
      cy.findByText(SECOND_QUESTION_NAME).should("be.visible");
    });
  });

  describe.skip("Entity selection with empty recents", () => {
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
});
