const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > navigation > navbar", () => {
  describe("Normal user", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();
    });

    it("should highlight relevant entities when navigating", () => {
      const questionName = "Bookmarked question";
      H.createQuestion(
        {
          name: questionName,
          collection_id: THIRD_COLLECTION_ID,
          query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        },
        {
          wrapId: true,
        },
      );

      cy.get("@questionId").then((id) => {
        cy.request("POST", `/api/bookmark/card/${id}`);
        H.visitQuestion(id);
      });

      H.openNavigationSidebar();
      H.assertNavigationSidebarItemSelected(/Third collection/);
      H.assertNavigationSidebarBookmarkSelected(questionName);

      H.newButton().click();
      H.popover()
        .findByText(/SQL query/)
        .click();

      H.openNavigationSidebar();
      H.assertNavigationSidebarItemSelected(/Third collection/, "false");
      H.assertNavigationSidebarBookmarkSelected(questionName, "false");
    });

    it("should display error ui when data fetching fails", () => {
      cy.intercept("GET", "/api/database", (req) => req.reply(500));
      cy.visit("/");
      H.navigationSidebar().findByText(/An error occurred/);
    });

    it("should preserve state when clicking the mb logo or a collection breadcrumb", () => {
      cy.visit("/collection/root");
      H.navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should("eq", "/");
      cy.findByTestId("home-page").should("be.visible");
      H.navigationSidebar().should("be.visible");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");

      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should("eq", "/");
      cy.findByTestId("home-page").should("be.visible");
      H.navigationSidebar().should("not.be.visible");

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
      H.appBar().contains("Our analytics").parentsUntil("a").first().click();
      cy.location("pathname").should("eq", "/collection/root");
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Our analytics",
      );
      H.navigationSidebar().should("not.be.visible");
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should preserve sidebar state when redirecting to the landing page", () => {
      H.updateSetting("landing-page", `/question/${ORDERS_QUESTION_ID}`);
      cy.visit("/");
      cy.location("pathname").should(
        "match",
        new RegExp(`^/question/${ORDERS_QUESTION_ID}\\b`),
      );
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      H.navigationSidebar().should("be.visible");

      cy.visit("/collection/root");
      H.navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should(
        "match",
        new RegExp(`^/question/${ORDERS_QUESTION_ID}\\b`),
      );
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      H.navigationSidebar().should("be.visible");

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should(
        "match",
        new RegExp(`^/question/${ORDERS_QUESTION_ID}\\b`),
      );
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
      H.navigationSidebar().should("not.be.visible");
    });
  });
});
