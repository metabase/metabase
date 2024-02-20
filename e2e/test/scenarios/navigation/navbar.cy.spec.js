import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  appBar,
  describeEE,
  navigationSidebar,
  setTokenFeatures,
  popover,
  visitDashboard,
  restore,
} from "e2e/support/helpers";

describe("scenarios > navigation > navbar", () => {
  describe("OSS", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should be open after logging in", () => {
      cy.visit("/");
      navigationSidebar().should("be.visible");
    });

    it("should display error ui when data fetching fails", () => {
      cy.intercept("GET", "/api/database", req => req.reply(500));
      cy.visit("/");
      navigationSidebar().findByText(/An error occurred/);
    });

    it("state should preserve when clicking the mb logo", () => {
      cy.visit("/collection/root");
      navigationSidebar().should("be.visible");
      cy.findByTestId("main-logo-link").click();
      navigationSidebar().should("be.visible");
      visitDashboard(ORDERS_DASHBOARD_ID);
      navigationSidebar().should("not.be.visible");
      cy.findByTestId("main-logo-link").click();
      navigationSidebar().should("not.be.visible");
    });

    it("should close when visiting a dashboard", () => {
      visitDashboard(ORDERS_DASHBOARD_ID);
      navigationSidebar().should("not.be.visible");
    });

    it("should preserve state when visting a collection", () => {
      visitDashboard(ORDERS_DASHBOARD_ID);
      navigationSidebar().should("not.be.visible");
      appBar().contains("Our analytics").parentsUntil("a").first().click();
      navigationSidebar().should("not.be.visible");
    });

    it("should close when creating a new question", () => {
      cy.visit("/");
      navigationSidebar().should("be.visible");
      appBar().findByText("New").click();
      popover()
        .findByText(/Question/)
        .click();
      navigationSidebar().should("not.be.visible");
    });

    it("should close when opening a sql editor", () => {
      cy.visit("/");
      navigationSidebar().should("be.visible");
      appBar().findByText("New").click();
      popover()
        .findByText(/SQL query/)
        .click();
      navigationSidebar().should("not.be.visible");
    });

    it("should be open when visiting home with a custom home page configured", () => {
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/custom-homepage", { value: true });
      cy.request("PUT", "/api/setting/custom-homepage-dashboard", {
        value: ORDERS_DASHBOARD_ID,
      });
      cy.visit("/");
      cy.reload();
      cy.url().should("contain", "question");
      navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and a custom home page is configured", () => {
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/custom-homepage", { value: true });
      cy.request("PUT", "/api/setting/custom-homepage-dashboard", {
        value: ORDERS_DASHBOARD_ID,
      });
      visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("main-logo-link").click();
      navigationSidebar().should("not.be.visible");
    });
  });

  describeEE("EE", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should be open when logging in with a landing page configured", () => {
      cy.request("PUT", "/api/setting/landing-page", {
        value: "/question/76",
      });
      cy.visit("/");
      cy.url().should("contain", "question");
      navigationSidebar().should("be.visible");
    });

    it("should preserve state when clicking the mb logo and landing page is configured", () => {
      cy.request("PUT", "/api/setting/landing-page", {
        value: "/question/76",
      });
      visitDashboard(ORDERS_DASHBOARD_ID);
      cy.findByTestId("main-logo-link").click();
      navigationSidebar().should("not.be.visible");
    });
  });
});
