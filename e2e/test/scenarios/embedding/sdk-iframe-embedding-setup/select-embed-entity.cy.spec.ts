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

  it.skip("shows an empty state on the sidebar when there is no recent activity", () => {
    cy.intercept("GET", "/api/activity/recents?*", {
      recents: [],
    }).as("emptyRecentItems");

    visitNewEmbedPage();
    cy.wait("@emptyRecentItems");

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click();

      cy.log("should not show recent dashboards description when no recents");
      cy.findByText("Choose from your recently visited dashboards").should(
        "not.exist",
      );

      cy.log("should show empty state with title and description");
      cy.findByTestId("embed-empty-state").should("be.visible");
      cy.findByText("No recent dashboards").should("be.visible");
      cy.findByText(/You haven't visited any dashboards recently/).should(
        "be.visible",
      );

      cy.log("should show search link in empty state description");
      cy.findByText("search for dashboards").should("be.visible");

      cy.log("should not show any recent item cards");
      cy.findByTestId("embed-recent-item-card").should("not.exist");
    });

    cy.log("test empty state for chart experience");
    getEmbedSidebar().within(() => {
      cy.findByText("Back").click();
      cy.findByText("Chart").click();

      cy.findByText("Choose from your recently visited charts").should(
        "not.exist",
      );

      cy.findByTestId("embed-empty-state").should("be.visible");
      cy.findByText("No recent charts").should("be.visible");
      cy.findByText(/You haven't visited any charts recently/).should(
        "be.visible",
      );
      cy.findByText("search for charts").should("be.visible");
    });
  });
});
