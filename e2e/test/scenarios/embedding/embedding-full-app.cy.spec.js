import {
  adhocQuestionHash,
  popover,
  appBar,
  restore,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/card/*/query`).as("getCardQuery");
    cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
    cy.intercept("GET", `/api/dashboard/*`).as("getDashboard");
    cy.intercept("GET", "/api/automagic-dashboards/**").as("getXrayDashboard");
  });

  describe("home page navigation", () => {
    it("should hide the top nav when nothing is shown", () => {
      visitUrl({ url: "/", qs: { side_nav: false, logo: false } });
      appBar().should("not.exist");
    });

    it("should show the top nav by default", () => {
      visitUrl({ url: "/" });
      appBar().should("be.visible");
      cy.findByTestId("main-logo").should("be.visible");
    });

    it("should hide the top nav by a param", () => {
      visitUrl({ url: "/", qs: { top_nav: false } });
      appBar().should("not.exist");
    });

    it("should not hide the top nav when the logo is still visible", () => {
      visitUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { breadcrumbs: false },
      });
      cy.findByTestId("main-logo").should("be.visible");
      appBar().within(() => {
        cy.findByText("Our analytics").should("not.exist");
      });
    });

    it("should keep showing sidebar toggle button when logo, breadcrumbs, the new button, and search are hidden", () => {
      visitUrl({
        url: "/",
        qs: {
          logo: false,
          breadcrumbs: false,
          search: false,
          new_button: false,
        },
      });

      appBar().should("be.visible");
      cy.button("Toggle sidebar").should("be.visible");
    });

    it("should show the top nav by a param", () => {
      visitUrl({ url: "/" });
      appBar().should("be.visible");
      cy.findByTestId("main-logo").should("be.visible");
      appBar().within(() => {
        cy.button(/New/).should("not.exist");
        cy.findByPlaceholderText("Search").should("not.exist");
      });
    });

    it("should hide the side nav by a param", () => {
      visitUrl({ url: "/", qs: { side_nav: false } });
      appBar().within(() => {
        cy.findByTestId("main-logo").should("be.visible");
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics").should("not.exist");
    });

    it("should show question creation controls by a param", () => {
      visitUrl({ url: "/", qs: { new_button: true } });
      appBar().within(() => {
        cy.button(/New/).should("be.visible");
      });
    });

    it("should show search controls by a param", () => {
      visitUrl({ url: "/", qs: { search: true } });
      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });

    it("should preserve params when navigating", () => {
      visitUrl({ url: "/", qs: { search: true } });

      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").should("be.visible");

      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });
  });

  describe("browse data", () => {
    it("should hide the top nav when nothing is shown", () => {
      visitUrl({ url: "/browse", qs: { side_nav: false, logo: false } });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our data").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics").should("not.exist");
      appBar().should("not.exist");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      visitQuestionUrl({ url: "/question/" + ORDERS_QUESTION_ID });

      cy.findByTestId("qb-header").should("be.visible");
      cy.findByTestId("qb-header-left-side").realHover();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited/).should("be.visible");

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("be.visible");
      cy.button("Summarize").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter").should("be.visible");
    });

    it("should hide the question header by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { header: false },
      });

      cy.findByTestId("qb-header").should("not.exist");
    });

    it("should hide the question's additional info by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { additional_info: false },
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited/).should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      cy.icon("refresh").should("be.visible");
      cy.icon("notebook").should("not.exist");
      cy.button("Summarize").should("not.exist");
      cy.button("Filter").should("not.exist");
    });

    describe("question creation", () => {
      beforeEach(() => {
        cy.signOut();
        cy.signInAsNormalUser();
      });

      it("should allow to create a new question from the navbar (metabase#21511)", () => {
        visitUrl({
          url: "/collection/root",
          qs: { top_nav: true, new_button: true, side_nav: false },
        });

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New").click();
        popover().findByText("Question").click();
        popover().findByText("Raw Data").click();
        popover().findByText("Orders").click();
      });

      it("should show the database for a new native question (metabase#21511)", () => {
        const newQuestionQuery = {
          dataset_query: {
            database: null,
            native: {
              query: "",
            },
            type: "native",
          },
          visualization_settings: {},
        };

        visitUrl({
          url: `/question#${adhocQuestionHash(newQuestionQuery)}`,
          qs: { side_nav: false },
        });

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Sample Database").should("be.visible");
      });
    });

    describe("desktop logo", () => {
      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      it("should hide main header when there's nothing to display there", () => {
        visitQuestionUrl({
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        cy.findByRole("banner").should("not.exist");
        cy.findByTestId("main-logo").should("not.exist");
        cy.icon("sidebar_closed").should("not.exist");
        cy.button("Toggle sidebar").should("not.exist");
      });
    });

    describe("mobile logo", () => {
      beforeEach(() => {
        cy.viewport("iphone-x");
      });

      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      it("should hide main header when there's nothing to display there", () => {
        visitQuestionUrl({
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        cy.findByRole("banner").should("not.exist");
        cy.findByTestId("main-logo").should("not.exist");
        cy.icon("sidebar_closed").should("not.exist");
        cy.button("Toggle sidebar").should("not.exist");
      });
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl({ url: "/dashboard/1" });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited/).should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl({ url: "/dashboard/1", qs: { header: false } });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    it("should hide the dashboard's additional info by a param", () => {
      visitDashboardUrl({
        url: "/dashboard/1",
        qs: { additional_info: false },
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited/).should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Our analytics").should("be.visible");
    });

    it("should preserve embedding options with click behavior (metabase#24756)", () => {
      addLinkClickBehavior({
        dashboardId: 1,
        linkTemplate: "/question/" + ORDERS_QUESTION_ID,
      });
      visitDashboardUrl({
        url: "/dashboard/1",
      });

      cy.findAllByRole("cell").first().click();
      cy.wait("@getCardQuery");

      // I don't know why this test starts to fail, but this command
      // will force the cursor to move away from the app bar, if
      // the cursor is still on the app bar, the logo will not be
      // be visible, since we'll only see the side bar toggle button.
      cy.findByRole("button", { name: /Filter/i }).realHover();

      cy.findByTestId("main-logo").should("be.visible");
    });
  });

  describe("x-ray dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitXrayDashboardUrl({ url: "/auto/dashboard/table/1" });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More X-rays").should("be.visible");
      cy.button("Save this").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitXrayDashboardUrl({
        url: "/auto/dashboard/table/1",
        qs: { header: false },
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

const addLinkClickBehavior = ({ dashboardId, linkTemplate }) => {
  cy.request("GET", `/api/dashboard/${dashboardId}`).then(({ body }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
      cards: body.ordered_cards.map(card => ({
        ...card,
        visualization_settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate,
          },
        },
      })),
    });
  });
};
