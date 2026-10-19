const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > navigation > navbar", () => {
  describe("Normal user", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();
    });

    it("should highlight entities, preserve state on logo and breadcrumb clicks, and show errors", () => {
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
      // creating new content collapses the navbar
      H.navigationSidebar().should("not.be.visible");

      H.openNavigationSidebar();
      H.assertNavigationSidebarItemSelected(/Third collection/, "false");
      H.assertNavigationSidebarBookmarkSelected(questionName, "false");

      cy.visit("/collection/root");
      H.navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should("eq", "/");
      cy.findByTestId("home-page").should("be.visible");
      H.navigationSidebar().should("be.visible");

      // navigating to a dashboard doesn't collapse the navbar
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
      H.dashboardGrid().should("be.visible");
      H.navigationSidebar().should("be.visible");

      // clicking the logo reopens a closed navbar
      H.closeNavigationSidebar();
      cy.findByTestId("main-logo-link").click();
      cy.location("pathname").should("eq", "/");
      cy.findByTestId("home-page").should("be.visible");
      H.navigationSidebar().should("be.visible");

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
      H.appBar().contains("Our analytics").parentsUntil("a").first().click();
      cy.location("pathname").should("eq", "/collection/root");
      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Our analytics",
      );
      H.navigationSidebar().should("not.be.visible");

      cy.intercept("GET", "/api/database", (req) => req.reply(500));
      cy.visit("/");
      H.navigationSidebar().findByText(/An error occurred/);
    });
  });

  describe("app bar breadcrumbs", () => {
    const LONG_COLLECTION_NAME = "A collection with a very long name "
      .repeat(4)
      .trim();

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should keep short breadcrumbs readable next to a very long one (#79984)", () => {
      H.createCollection({ name: "Examples" })
        .then(({ body: parent }) =>
          H.createCollection({
            name: LONG_COLLECTION_NAME,
            parent_id: parent.id,
          }),
        )
        .then(({ body: collection }) =>
          H.createQuestion(
            {
              name: "People model",
              type: "model",
              collection_id: collection.id,
              query: { "source-table": PEOPLE_ID },
            },
            { wrapId: true, idAlias: "modelId" },
          ),
        );

      cy.log("Collection path on the model page");
      cy.get("@modelId").then((modelId) => H.visitModel(modelId));
      assertBreadcrumbIsNotTruncated("Examples");
      assertBreadcrumbIsTruncated(LONG_COLLECTION_NAME);
      H.appBar().findByText(LONG_COLLECTION_NAME).realHover();
      H.tooltip().should("be.visible").and("have.text", LONG_COLLECTION_NAME);

      cy.log("Full trail in the object detail view");
      cy.get("@modelId").then((modelId) => H.DetailView.visitModel(modelId, 1));
      assertBreadcrumbIsNotTruncated("Examples");
      assertBreadcrumbIsNotTruncated("People model");
      assertBreadcrumbIsNotTruncated("Hudson Borer");
      assertBreadcrumbIsTruncated(LONG_COLLECTION_NAME);
      H.appBar().findByText(LONG_COLLECTION_NAME).realHover();
      H.tooltip().should("be.visible").and("have.text", LONG_COLLECTION_NAME);
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
      // clicking the logo reopens the navbar, and the redirect keeps it open
      H.navigationSidebar().should("be.visible");
    });
  });
});

function assertBreadcrumbIsNotTruncated(name) {
  H.appBar()
    .findByText(name)
    .should("be.visible")
    .and(($element) => H.assertIsNotEllipsified($element[0]));
}

function assertBreadcrumbIsTruncated(name) {
  H.appBar()
    .findByText(name)
    .should("be.visible")
    .and(($element) => H.assertIsEllipsified($element[0]));
}
