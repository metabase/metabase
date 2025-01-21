import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > navigation > navbar", () => {
  describe("Normal user", () => {
    beforeEach(() => {
      cy.restore();
      cy.signInAsNormalUser();
    });

    it("should be open after logging in", () => {
      cy.visit("/");
      cy.navigationSidebar().should("be.visible");
    });

    it("should display error ui when data fetching fails", () => {
      cy.intercept("GET", "/api/database", req => req.reply(500));
      cy.visit("/");
      cy.navigationSidebar().findByText(/An error occurred/);
    });

    it("state should preserve when clicking the mb logo", () => {
      cy.visit("/collection/root");
      cy.navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.navigationSidebar().should("be.visible");
      cy.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.navigationSidebar().should("not.be.visible");

      cy.findByTestId("main-logo-link").click();
      cy.navigationSidebar().should("not.be.visible");
    });

    it("should close when visiting a dashboard", () => {
      cy.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.navigationSidebar().should("not.be.visible");
    });

    it("should preserve state when visiting a collection", () => {
      cy.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.navigationSidebar().should("not.be.visible");
      cy.appBar().contains("Our analytics").parentsUntil("a").first().click();
      cy.navigationSidebar().should("not.be.visible");
    });

    it("should close when creating a new question", () => {
      cy.visit("/");
      cy.navigationSidebar().should("be.visible");
      cy.appBar().findByText("New").click();
      cy.popover()
        .findByText(/Question/)
        .click();
      cy.navigationSidebar().should("not.be.visible");
    });

    it("should close when opening a sql editor", () => {
      cy.visit("/");
      cy.navigationSidebar().should("be.visible");
      cy.appBar().findByText("New").click();
      cy.popover()
        .findByText(/SQL query/)
        .click();
      cy.navigationSidebar().should("not.be.visible");
    });
  });

  describe("Custom Homepage", () => {
    beforeEach(() => {
      cy.restore();
      cy.signInAsAdmin();
      cy.updateSetting("custom-homepage", true);
      cy.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
    });

    it("should be open when visiting home with a custom home page configured", () => {
      cy.visit("/");
      cy.url().should("contain", "/dashboard/");
      cy.navigationSidebar().should("be.visible");

      cy.findByTestId("main-logo-link").click();
      cy.navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and custom home page is configured", () => {
      cy.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.navigationSidebar().should("not.be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.navigationSidebar().should("not.be.visible");
    });
  });

  cy.describeEE("EE", () => {
    beforeEach(() => {
      cy.restore();
      cy.signInAsAdmin();
      cy.setTokenFeatures("all");
    });

    it("should be open when logging in with a landing page configured", () => {
      cy.updateSetting("landing-page", "/question/76");
      cy.visit("/");
      cy.url().should("contain", "question");
      cy.navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and landing page is configured", () => {
      cy.updateSetting("landing-page", "/question/76");
      cy.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("main-logo-link").click();
      cy.navigationSidebar().should("not.be.visible");
    });
  });
});
