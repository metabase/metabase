import {
  describeEE,
  setTokenFeatures,
  popover,
  visitDashboard,
  restore,
} from "e2e/support/helpers";

describe("scenarios > navigation > navbar", () => {
  describe("OSS", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();
    });

    it("should be open after logging in", () => {
      cy.visit("/");
      cy.findByTestId("main-navbar-root").should("be.visible");
    });

    it("state should preserve when clicking the mb logo", () => {
      cy.visit("/collection/root");
      cy.findByTestId("main-navbar-root").should("be.visible");
      cy.findByTestId("main-logo-link").click();
      cy.url().should("eq", `${location.origin}/`);
    });

    it("should close when visiting a dashboard", () => {
      visitDashboard(8);
      cy.findByTestId("main-navbar-root").should("not.be.visible");
    });

    it("should preserve state when visting a collection", () => {
      visitDashboard(8);
      cy.findByTestId("main-navbar-root").should("not.be.visible");
      cy.findByTestId("app-bar")
        .contains("Our analytics")
        .parentsUntil("a")
        .first()
        .click();
      cy.findByTestId("main-navbar-root").should("not.be.visible");
    });

    it("should close when creating a new question", () => {
      cy.visit("/");
      cy.findByTestId("main-navbar-root").should("be.visible");
      cy.findByTestId("app-bar").findByText("New").click();
      popover()
        .findByText(/Question/)
        .click();
      cy.findByTestId("main-navbar-root").should("not.be.visible");
    });
    it("should close when opening a sql editor", () => {
      cy.visit("/");
      cy.findByTestId("main-navbar-root").should("be.visible");
      cy.findByTestId("app-bar").findByText("New").click();
      popover()
        .findByText(/SQL query/)
        .click();
      cy.findByTestId("main-navbar-root").should("not.be.visible");
    });

    it("should be open when visiting home with a custom home page configured", () => {
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/custom-homepage", { value: true });
      cy.request("PUT", "/api/setting/custom-homepage-dashboard", { value: 8 });
      cy.visit("/");
      cy.url().should("contain", "dashboard");
      cy.findByTestId("main-navbar-root").should("be.visible");
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
      cy.findByTestId("main-navbar-root").should("be.visible");
    });
  });
});
