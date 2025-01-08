import { H } from "e2e/support";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

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

    it("should display error ui when data fetching fails", () => {
      cy.intercept("GET", "/api/database", req => req.reply(500));
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

  H.describeEE("EE", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
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
});
