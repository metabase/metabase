import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  adhocQuestionHash,
  entityPickerModal,
  popover,
  appBar,
  restore,
  setTokenFeatures,
  describeEE,
  navigationSidebar,
  getDashboardCard,
  getTextCardDetails,
  updateDashboardCards,
  getNextUnsavedDashboardCardId,
  dashboardGrid,
  createDashboardWithTabs,
  goToTab,
  visitFullAppEmbeddingUrl,
  getDashboardCardMenu,
  entityPickerModalTab,
} from "e2e/support/helpers";
import {
  createMockDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

const { ORDERS } = SAMPLE_DATABASE;

describeEE("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
    cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/automagic-dashboards/**").as("getXrayDashboard");
  });

  describe("home page navigation", () => {
    it("should show the top and side nav by default", () => {
      visitFullAppEmbeddingUrl({ url: "/" });
      cy.wait("@getXrayDashboard");

      appBar()
        .should("be.visible")
        .within(() => {
          cy.findByTestId("main-logo").should("be.visible");
          cy.button(/New/).should("not.exist");
          cy.findByPlaceholderText("Search").should("not.exist");
        });

      sideNav().should("be.visible");
    });

    it("should hide the top nav when nothing is shown", () => {
      visitFullAppEmbeddingUrl({
        url: "/",
        qs: { side_nav: false, logo: false },
      });
      cy.wait("@getXrayDashboard");
      appBar().should("not.exist");
    });

    it("should hide the top nav by an explicit param", () => {
      visitFullAppEmbeddingUrl({ url: "/", qs: { top_nav: false } });
      cy.wait("@getXrayDashboard");
      appBar().should("not.exist");
    });

    it("should not hide the top nav when the logo is still visible", () => {
      visitFullAppEmbeddingUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { breadcrumbs: false },
      });
      cy.wait("@getCardQuery");

      appBar().within(() => {
        cy.findByTestId("main-logo").should("be.visible");
        cy.findByRole("treeitem", { name: "Our analytics" }).should(
          "not.exist",
        );
      });
    });

    it("should keep showing sidebar toggle button when logo, breadcrumbs, the new button, and search are hidden", () => {
      visitFullAppEmbeddingUrl({
        url: "/",
        qs: {
          logo: false,
          breadcrumbs: false,
          search: false,
          new_button: false,
        },
      });
      cy.wait("@getXrayDashboard");

      sideNav().should("be.visible");
      appBar()
        .should("be.visible")
        .within(() => {
          cy.button("Toggle sidebar").should("be.visible").click();
        });
      sideNav().should("not.be.visible");
    });

    it("should hide the side nav by a param", () => {
      visitFullAppEmbeddingUrl({ url: "/", qs: { side_nav: false } });
      appBar().within(() => {
        cy.findByTestId("main-logo").should("be.visible");
        cy.button("Toggle sidebar").should("not.exist");
      });
      sideNav().should("not.exist");
    });

    it("should disable home link when top nav is enabled but side nav is disabled", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { top_nav: true, side_nav: false },
      });
      cy.findByTestId("main-logo-link").should(
        "have.attr",
        "disabled",
        "disabled",
      );
    });

    it("should show question creation controls by a param", () => {
      visitFullAppEmbeddingUrl({ url: "/", qs: { new_button: true } });
      appBar().within(() => {
        cy.button(/New/).should("be.visible");
      });
    });

    it("should show search controls by a param", () => {
      visitFullAppEmbeddingUrl({ url: "/", qs: { search: true } });
      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });

    it("should preserve params when navigating", () => {
      visitFullAppEmbeddingUrl({ url: "/", qs: { search: true } });

      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });

      sideNav().findByText("Our analytics").click();

      cy.findAllByRole("rowgroup")
        .should("contain", "Orders in a dashboard")
        .and("be.visible");

      appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });
  });

  describe("browse data", () => {
    it("should hide the top nav when nothing is shown", () => {
      visitFullAppEmbeddingUrl({
        url: "/browse/databases",
        qs: { side_nav: false, logo: false },
      });
      cy.findByRole("heading", { name: /Databases/ }).should("be.visible");
      cy.findByRole("treeitem", { name: /Browse databases/ }).should(
        "not.exist",
      );
      cy.findByRole("treeitem", { name: "Our analytics" }).should("not.exist");
      appBar().should("not.exist");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      visitQuestionUrl({ url: "/question/" + ORDERS_QUESTION_ID });

      cy.findByTestId("qb-header").should("be.visible");
      cy.findByTestId("qb-header-left-side").realHover();
      cy.button(/Edited/).should("be.visible");

      cy.icon("refresh").should("be.visible");
      cy.findByTestId("notebook-button").should("be.visible");
      cy.button("Summarize").should("be.visible");
      cy.button("Filter").should("be.visible");
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

      cy.findByTestId("app-bar")
        .findByText("Our analytics")
        .should("be.visible");
      cy.findByTestId("qb-header")
        .findByText(/Edited/)
        .should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      cy.icon("refresh").should("be.visible");
      cy.findByTestId("notebook-button").should("not.exist");
      cy.button("Summarize").should("not.exist");
      cy.button("Filter").should("not.exist");
    });

    it("should send 'X-Metabase-Client' header for api requests", () => {
      visitFullAppEmbeddingUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      cy.wait("@getCardQuery").then(({ request }) => {
        expect(request?.headers?.["x-metabase-client"]).to.equal(
          "embedding-iframe",
        );
      });
    });

    describe("question creation", () => {
      beforeEach(() => {
        cy.signOut();
        cy.signInAsNormalUser();
      });

      it("should allow to create a new question from the navbar (metabase#21511)", () => {
        visitFullAppEmbeddingUrl({
          url: "/collection/root",
          qs: { top_nav: true, new_button: true, side_nav: false },
        });

        cy.button("New").click();
        popover().findByText("Question").click();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          cy.findByText("Orders").click();
        });
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

        visitFullAppEmbeddingUrl({
          url: `/question#${adhocQuestionHash(newQuestionQuery)}`,
          qs: { side_nav: false },
        });

        cy.findByTestId("native-query-editor-container")
          .findByText(/Sample Database/)
          .should("be.visible");
      });
    });

    describe("desktop logo", () => {
      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      it("should hide main header when there's nothing to display there", () => {
        visitQuestionUrl({
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        cy.findByDisplayValue("Orders");
        cy.findByTestId("app-bar").should("not.exist");
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
        cy.findByDisplayValue("Orders");
        cy.findByTestId("app-bar").should("not.exist");
        cy.findByTestId("main-logo").should("not.exist");
        cy.icon("sidebar_closed").should("not.exist");
        cy.button("Toggle sidebar").should("not.exist");
      });
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl({ url: `/dashboard/${ORDERS_DASHBOARD_ID}` });

      cy.findByTestId("dashboard-name-heading").should("be.visible");
      cy.button(/Edited.*by/).should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { header: false },
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      dashboardGrid().findByText("Rows 1-6 of first 2000").should("be.visible");
    });

    it("should hide the dashboard with multiple tabs header by a param and allow selecting tabs (metabase#38429, metabase#39002)", () => {
      const FIRST_TAB = { id: 1, name: "Tab 1" };
      const SECOND_TAB = { id: 2, name: "Tab 2" };
      createDashboardWithTabs({
        dashboard: {
          name: "Dashboard with tabs",
        },
        tabs: [FIRST_TAB, SECOND_TAB],
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: FIRST_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            size_x: 10,
            size_y: 8,
          }),
        ],
      }).then(dashboard => {
        visitDashboardUrl({
          url: `/dashboard/${dashboard.id}`,
          qs: { header: false },
        });
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      dashboardGrid().findByText("Rows 1-6 of first 2000").should("be.visible");
      goToTab(SECOND_TAB.name);
      cy.findByTestId("dashboard-parameters-and-cards")
        .findByText("There's nothing here, yet.")
        .should("be.visible");
    });

    it("should hide the dashboard's additional info by a param", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { additional_info: false },
      });

      cy.findByTestId("dashboard-header")
        .findByText("Orders in a dashboard")
        .should("be.visible");
      cy.findByTestId("dashboard-header")
        .findByText(/Edited/)
        .should("not.exist");
      cy.findByTestId("app-bar")
        .findByText("Our analytics")
        .should("be.visible");
    });

    it("should preserve embedding options with click behavior (metabase#24756)", () => {
      addLinkClickBehavior({
        dashboardId: ORDERS_DASHBOARD_ID,
        linkTemplate: "/question/" + ORDERS_QUESTION_ID,
      });
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      cy.findAllByRole("cell").first().click();
      cy.wait("@getCardQuery");

      // I don't know why this test starts to fail, but this command
      // will force the cursor to move away from the app bar, if
      // the cursor is still on the app bar, the logo will not be
      // be visible, since we'll only see the side bar toggle button.
      cy.findByTestId("question-filter-header").realHover();

      cy.findByTestId("main-logo").should("be.visible");
    });

    it("should have parameters header occupied the entire horizontal space when visiting a dashboard via navigation (metabase#30645)", () => {
      const filterId = "50c9eac6";
      const dashboardDetails = {
        name: "interactive dashboard embedding",
        parameters: [
          {
            id: filterId,
            name: "ID",
            slug: "id",
            type: "id",
          },
        ],
      };
      cy.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          const textDashcard = getTextCardDetails({
            col: 0,
            row: 0,
            size_x: 6,
            size_y: 20,
            text: "I am a very long text card",
          });
          const dashcard = createMockDashboardCard({
            id: getNextUnsavedDashboardCardId(),
            col: 8,
            row: 0,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              {
                parameter_id: filterId,
                card_id: ORDERS_QUESTION_ID,
                target: [
                  "dimension",
                  ["field", ORDERS.ID, { "base-type": "type/Integer" }],
                ],
              },
            ],
          });
          updateDashboardCards({
            dashboard_id: dashboardId,
            cards: [dashcard, textDashcard],
          });
        },
      );

      visitFullAppEmbeddingUrl({ url: "/" });

      cy.log("Navigate to a dashboard via in-app navigation");
      navigationSidebar().findByText("Our analytics").click();
      cy.findByRole("main").findByText(dashboardDetails.name).click();
      navigationSidebar().findByText("Our analytics").should("not.be.visible");

      cy.get("main header")
        .findByText(dashboardDetails.name)
        .should("be.visible");
      getDashboardCard()
        .findByText("I am a very long text card")
        .should("be.visible");

      // The bug won't appear if we scroll instantly and check the position of the dashboard parameter header.
      // I suspect that happens because we used to calculate the dashboard parameter header position in JavaScript,
      // which could take some time.
      const FPS = 1000 / 60;
      cy.findByRole("main").scrollTo("bottom", { duration: 2 * FPS });

      getDashboardCard()
        .findByText("I am a very long text card")
        .should("not.be.visible");
      cy.findByTestId("dashboard-parameters-widget-container").then(
        $dashboardParameters => {
          const dashboardParametersRect =
            $dashboardParameters[0].getBoundingClientRect();
          expect(dashboardParametersRect.x).to.equal(0);
        },
      );
    });

    it("should send `frame` message with dashboard height when the dashboard is resized (metabase#37437)", () => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };
      createDashboardWithTabs({
        tabs: [TAB_1, TAB_2],
        name: "Dashboard",
        dashcards: [
          createMockTextDashboardCard({
            dashboard_tab_id: TAB_1.id,
            size_x: 10,
            size_y: 20,
            text: "I am a text card",
          }),
        ],
      }).then(dashboard => {
        visitFullAppEmbeddingUrl({
          url: `/dashboard/${dashboard.id}`,
          onBeforeLoad(window) {
            cy.spy(window.parent, "postMessage").as("postMessage");
          },
        });
      });

      // TODO: Find a way to assert that this is the last call.
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: Cypress.sinon.match(value => value > 1000),
          },
        },
      });

      cy.get("@postMessage").invoke("resetHistory");
      cy.findByRole("tab", { name: TAB_2.name }).click();
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: Cypress.sinon.match(value => value < 400),
          },
        },
      });

      cy.get("@postMessage").invoke("resetHistory");
      cy.findByTestId("app-bar").findByText("Our analytics").click();

      cy.findByRole("heading", { name: "Metabase analytics" }).should(
        "be.visible",
      );
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: 800,
          },
        },
      });
    });

    it("should allow downloading question results when logged in via Google SSO (metabase#39848)", () => {
      const CSRF_TOKEN = "abcdefgh";
      cy.intercept("GET", "/api/user/current", req => {
        req.on("response", res => {
          res.headers["X-Metabase-Anti-CSRF-Token"] = CSRF_TOKEN;
        });
      });
      cy.intercept(
        "POST",
        "/api/dashboard/*/dashcard/*/card/*/query/csv?format_rows=true",
      ).as("CsvDownload");
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      getDashboardCard().realHover();
      getDashboardCardMenu().click();
      popover().findByText("Download results").click();
      popover().findByText(".csv").click();

      cy.wait("@CsvDownload").then(interception => {
        expect(
          interception.request.headers["x-metabase-anti-csrf-token"],
        ).to.equal(CSRF_TOKEN);
      });
    });

    it("should send 'X-Metabase-Client' header for api requests", () => {
      visitFullAppEmbeddingUrl({ url: `/dashboard/${ORDERS_DASHBOARD_ID}` });

      cy.wait("@getDashboard").then(({ request }) => {
        expect(request?.headers?.["x-metabase-client"]).to.equal(
          "embedding-iframe",
        );
      });
    });
  });

  describe("x-ray dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitXrayDashboardUrl({ url: "/auto/dashboard/table/1" });

      cy.findByRole("heading", { name: "More X-rays" }).should("be.visible");
      cy.button("Save this").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitXrayDashboardUrl({
        url: "/auto/dashboard/table/1",
        qs: { header: false },
      });

      cy.findByRole("heading", { name: "More X-rays" }).should("be.visible");
      cy.button("Save this").should("not.exist");
    });
  });
});

const visitQuestionUrl = urlOptions => {
  visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getCardQuery");
};

const visitDashboardUrl = urlOptions => {
  visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getDashboard");
  cy.wait("@getDashCardQuery");
};

const visitXrayDashboardUrl = urlOptions => {
  visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getXrayDashboard");
};

const addLinkClickBehavior = ({ dashboardId, linkTemplate }) => {
  cy.request("GET", `/api/dashboard/${dashboardId}`).then(({ body }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      dashcards: body.dashcards.map(card => ({
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

const sideNav = () => {
  return cy.findByTestId("main-navbar-root");
};
