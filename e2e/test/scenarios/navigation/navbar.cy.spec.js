const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > navigation > navbar", () => {
  describe("Normal user", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();
    });

    it("should be open after logging in", () => {
      cy.visit("/");
      H.navigationSidebar().should("be.visible");
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

    it("state should preserve when clicking the mb logo", () => {
      cy.visit("/collection/root");
      H.navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      H.navigationSidebar().should("be.visible");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");

      cy.findByTestId("main-logo-link").click();
      H.navigationSidebar().should("not.be.visible");
    });

    it("should close when visiting a dashboard", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
    });

    it("should preserve state when visiting a collection", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
      H.appBar().contains("Our analytics").parentsUntil("a").first().click();
      H.navigationSidebar().should("not.be.visible");
    });

    it("should close when creating a new question", () => {
      cy.visit("/");
      H.navigationSidebar().should("be.visible");
      H.appBar().findByText("New").click();
      H.popover()
        .findByText(/Question/)
        .click();
      H.navigationSidebar().should("not.be.visible");
    });

    it("should close when opening a sql editor", () => {
      cy.visit("/");
      H.navigationSidebar().should("be.visible");
      H.appBar().findByText("New").click();
      H.popover()
        .findByText(/SQL query/)
        .click();
      H.navigationSidebar().should("not.be.visible");
    });
  });

  describe("Custom Homepage", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.updateSetting("custom-homepage", true);
      H.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
    });

    it("should be open when visiting home with a custom home page configured", () => {
      cy.visit("/");
      cy.url().should("contain", "/dashboard/");
      H.navigationSidebar().should("be.visible");

      cy.findByTestId("main-logo-link").click();
      H.navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and custom home page is configured", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.navigationSidebar().should("not.be.visible");
      cy.findByTestId("main-logo-link").click();
      H.navigationSidebar().should("not.be.visible");
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should be open when logging in with a landing page configured", () => {
      H.updateSetting("landing-page", "/question/76");
      cy.visit("/");
      cy.url().should("contain", "question");
      H.navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and landing page is configured", () => {
      H.updateSetting("landing-page", "/question/76");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("main-logo-link").click();
      H.navigationSidebar().should("not.be.visible");
    });
  });

  describe("library", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
    });

    it("should show the library when a table is published", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      cy.visit("/");
      H.navigationSidebar()
        .findByRole("section", { name: "Library" })
        .findByText("Data")
        .click();
      H.collectionTable().findByText("Orders").click();
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
    });
  });
});
