import { restore } from "__support__/e2e/cypress";

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
      visitAppUrl("/");
      cy.findByTestId("main-logo").should("not.exist");
    });

    it("should show the top nav by a param", () => {
      visitAppUrl("/?top_nav=true");
      cy.findAllByTestId("main-logo").should("be.visible");
      cy.button(/New/).should("not.exist");
      cy.findByPlaceholderText("Search").should("not.exist");
    });

    it("should show question creation controls by a param", () => {
      visitAppUrl("/?top_nav=true&new_button=true");
      cy.button(/New/).should("be.visible");
    });

    it("should show search controls by a param", () => {
      visitAppUrl("/?top_nav=true&search=true");
      cy.findByPlaceholderText("Search…").should("be.visible");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      visitQuestionUrl("/question/1");

      cy.findByTestId("qb-header").should("be.visible");
      cy.findByText(/Edited/).should("be.visible");
      cy.findByText("Our analytics").should("be.visible");

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("be.visible");
      cy.button("Summarize").should("be.visible");
      cy.button("Filter").should("be.visible");
    });

    it("should hide the question header by a param", () => {
      visitQuestionUrl("/question/1?header=false");

      cy.findByTestId("qb-header").should("not.exist");
    });

    it("should hide the question's additional info by a param", () => {
      visitQuestionUrl("/question/1?additional_info=false");

      cy.findByText("Our analytics").should("not.exist");
      cy.findByText(/Edited/).should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      visitQuestionUrl("/question/1?action_buttons=false");

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("not.exist");
      cy.button("Summarize").should("not.exist");
      cy.button("Filter").should("not.exist");
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl("/dashboard/1");

      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText(/Edited/).should("be.visible");
      cy.findByText("Our analytics").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl("/dashboard/1?header=false");

      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    it("should hide the dashboard's additional info by a param", () => {
      visitDashboardUrl("/dashboard/1?additional_info=false");

      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText(/Edited/).should("not.exist");
      cy.findByText("Our analytics").should("not.exist");
    });
  });

  describe("x-ray dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitXrayDashboardUrl("/auto/dashboard/table/1");
      cy.findByText("More X-rays").should("be.visible");
      cy.button("Save this").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitXrayDashboardUrl("/auto/dashboard/table/1?header=false");
      cy.findByText("More X-rays").should("be.visible");
      cy.button("Save this").should("not.exist");
    });
  });
});

const visitAppUrl = url => {
  cy.visit(url, {
    onBeforeLoad(window) {
      window.Cypress = undefined;
    },
  });
};

const visitQuestionUrl = url => {
  visitAppUrl(url);
  cy.wait("@getCardQuery");
};

const visitDashboardUrl = url => {
  visitAppUrl(url);
  cy.wait("@getDashboard");
  cy.wait("@getDashCardQuery");
};

const visitXrayDashboardUrl = url => {
  visitAppUrl(url);
  cy.wait("@getXrayDashboard");
};
