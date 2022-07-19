import { restore } from "__support__/e2e/helpers";

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/card/*/query`).as("getCardQuery");
    cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
    cy.intercept("GET", `/api/dashboard/*`).as("getDashboard");
    cy.intercept("GET", "/api/automagic-dashboards/**").as("getXrayDashboard");
  });

  describe("navigation", () => {
    it("should hide the top nav by default", () => {
      visitUrl({ url: "/" });
      cy.findByText("Our analytics").should("be.visible");
      cy.findByTestId("main-logo").should("not.exist");
    });

    it("should show the top nav by a param", () => {
      visitUrl({ url: "/", qs: { top_nav: true } });
      cy.findAllByTestId("main-logo").should("be.visible");
      cy.button(/New/).should("not.exist");
      cy.findByPlaceholderText("Search").should("not.exist");
    });

    it("should hide the side nav by a param", () => {
      visitUrl({ url: "/", qs: { top_nav: true, side_nav: false } });
      cy.findAllByTestId("main-logo").should("be.visible");
      cy.findByText("Our analytics").should("not.exist");
    });

    it("should show question creation controls by a param", () => {
      visitUrl({ url: "/", qs: { top_nav: true, new_button: true } });
      cy.button(/New/).should("be.visible");
    });

    it("should show search controls by a param", () => {
      visitUrl({ url: "/", qs: { top_nav: true, search: true } });
      cy.findByPlaceholderText("Search…").should("be.visible");
    });

    it("should preserve params when navigating", () => {
      visitUrl({ url: "/", qs: { top_nav: true } });
      cy.findAllByTestId("main-logo").should("be.visible");

      cy.findByText("Our analytics").click();
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findAllByTestId("main-logo").should("be.visible");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      visitQuestionUrl({ url: "/question/1" });

      cy.findByTestId("qb-header").should("be.visible");
      cy.findByTestId("qb-header-left-side").realHover();
      cy.findByText(/Edited/).should("be.visible");

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("be.visible");
      cy.button("Summarize").should("be.visible");
      cy.findByText("Filter").should("be.visible");
    });

    it("should hide the question header by a param", () => {
      visitQuestionUrl({ url: "/question/1", qs: { header: false } });

      cy.findByTestId("qb-header").should("not.exist");
    });

    it("should hide the question's additional info by a param", () => {
      visitQuestionUrl({ url: "/question/1", qs: { additional_info: false } });

      cy.findByText("Our analytics").should("not.exist");
      cy.findByText(/Edited/).should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      visitQuestionUrl({ url: "/question/1", qs: { action_buttons: false } });

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("not.exist");
      cy.button("Summarize").should("not.exist");
      cy.button("Filter").should("not.exist");
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl({ url: "/dashboard/1" });

      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText(/Edited/).should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl({ url: "/dashboard/1", qs: { header: false } });

      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    it("should hide the dashboard's additional info by a param", () => {
      visitDashboardUrl({
        url: "/dashboard/1",
        qs: { additional_info: false },
      });

      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText(/Edited/).should("not.exist");
      cy.findByText("Our analytics").should("not.exist");
    });
  });

  describe("x-ray dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitXrayDashboardUrl({ url: "/auto/dashboard/table/1" });

      cy.findByText("More X-rays").should("be.visible");
      cy.button("Save this").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitXrayDashboardUrl({
        url: "/auto/dashboard/table/1",
        qs: { header: false },
      });

      cy.findByText("More X-rays").should("be.visible");
      cy.button("Save this").should("not.exist");
    });
  });
});

const visitUrl = url => {
  cy.visit({
    ...url,
    onBeforeLoad(window) {
      // cypress runs all tests in an iframe and the app uses this property to avoid embedding mode for all tests
      // by removing the property the app would work in embedding mode
      window.Cypress = undefined;
    },
  });
};

const visitQuestionUrl = url => {
  visitUrl(url);
  cy.wait("@getCardQuery");
};

const visitDashboardUrl = url => {
  visitUrl(url);
  cy.wait("@getDashboard");
  cy.wait("@getDashCardQuery");
};

const visitXrayDashboardUrl = url => {
  visitUrl(url);
  cy.wait("@getXrayDashboard");
};
