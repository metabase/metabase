import {
  addOrUpdateDashboardCard,
  dashboardHeader,
  editDashboard,
  getDashboardCard,
  modal,
  popover,
  restore,
  saveDashboard,
  resetTestTable,
  resyncDatabase,
  showDashboardCardActions,
  sidebar,
  visitDashboard,
  visitEmbeddedPage,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { b64hash_to_utf8 } from "metabase/lib/encoding";

const POINT_INDEX = 4;

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

const TARGET_DASHBOARD = {
  name: "Target dashboard",
};

const QUESTION_LINE_CHART = {
  name: "Line chart",
  display: "line",
  query: {
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    "source-table": ORDERS_ID,
    limit: 5,
  },
};

const TARGET_QUESTION = {
  ...QUESTION_LINE_CHART,
  name: "Target question",
};

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should show filters defined on a question with filter pass-thru (metabase#15993)", () => {
    cy.createQuestion({
      name: "15993",
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: { id: question1Id } }) => {
      cy.createNativeQuestion({ native: { query: "select 0" } }).then(
        ({ body: { id: nativeId } }) => {
          cy.createDashboard().then(({ body: { id: dashboardId } }) => {
            // Add native question to the dashboard
            addOrUpdateDashboardCard({
              dashboard_id: dashboardId,
              card_id: nativeId,
              card: {
                // Add click behavior to the dashboard card and point it to the question 1
                visualization_settings: getVisualizationSettings(question1Id),
              },
            });
            visitDashboard(dashboardId);
          });
        },
      );
    });

    // Drill-through
    cy.findAllByTestId("cell-data").get(".link").contains("0").realClick();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("117.03").should("not.exist"); // Total for the order in which quantity wasn't 0
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 0");

    const getVisualizationSettings = targetId => ({
      column_settings: {
        '["name","0"]': {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${ORDERS.QUANTITY},null]]`]: {
                source: {
                  type: "column",
                  id: "0",
                  name: "0",
                },
                target: {
                  type: "dimension",
                  id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
                  dimension: ["dimension", ["field", ORDERS.QUANTITY, null]],
                },
                id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
              },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });

  it("should not change the visualization type in a targetted question with mapped filter (metabase#16334)", () => {
    // Question 2, that we're adding to the dashboard
    const questionDetails = {
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    cy.createQuestion({
      name: "16334",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    }).then(({ body: { id: question1Id } }) => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 10,
                visualization_settings: getVisualizationSettings(question1Id),
              },
            ],
          });

          visitDashboard(dashboard_id);
        },
      );
    });

    cy.findAllByTestId("cell-data").contains("5").first().click();

    // Make sure filter is set
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is equal to 5");

    // Make sure it's connected to the original question
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Started from 16334");

    // Make sure the original visualization didn't change
    cy.findAllByTestId("slice");

    const getVisualizationSettings = targetId => ({
      column_settings: {
        [`["ref",["field",${REVIEWS.RATING},null]]`]: {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${PRODUCTS.RATING},null]]`]: {
                source: {
                  type: "column",
                  id: "RATING",
                  name: "Rating",
                },
                target: {
                  type: "dimension",
                  id: [`["dimension",["field",${PRODUCTS.RATING},null]]`],
                  dimension: ["dimension", ["field", PRODUCTS.RATING, null]],
                },
                id: [`["dimension",["field",${PRODUCTS.RATING},null]]`],
              },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });

  it("should navigate to a target from a gauge card (metabase#23137)", () => {
    const target_id = 1;

    cy.createQuestionAndDashboard({
      questionDetails: getQuestionDetails({ display: "gauge" }),
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [getDashcardDetails({ id, card_id, target_id })],
      });

      visitDashboard(dashboard_id);
    });

    cy.findByTestId("gauge-arc-1").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
  });

  it("should navigate to a target from a progress card (metabase#23137)", () => {
    const target_id = 1;

    cy.createQuestionAndDashboard({
      questionDetails: getQuestionDetails({ display: "progress" }),
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [getDashcardDetails({ id, card_id, target_id })],
      });

      visitDashboard(dashboard_id);
    });

    cy.findByTestId("progress-bar").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
  });

  it(
    "should allow settings click behavior on boolean fields (metabase#18067)",
    { tags: "@external" },
    () => {
      const dialect = "mysql";
      const TEST_TABLE = "many_data_types";
      resetTestTable({ type: dialect, table: TEST_TABLE });
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();
      resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TEST_TABLE,
        tableAlias: "testTable",
      });

      cy.get("@testTable").then(testTable => {
        const dashboardDetails = {
          name: "18067 dashboard",
        };
        const questionDetails = {
          name: "18067 question",
          database: WRITABLE_DB_ID,
          query: { "source-table": testTable.id },
        };
        cy.createQuestionAndDashboard({
          dashboardDetails,
          questionDetails,
        }).then(({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        });
      });

      editDashboard();

      cy.log('Select "click behavior" option');
      showDashboardCardActions();
      cy.findByTestId("dashboardcard-actions-panel").icon("click").click();

      sidebar().within(() => {
        cy.findByText("Boolean").scrollIntoView().click();
        cy.contains("Click behavior for Boolean").should("be.visible");
      });
    },
  );

  describe("line chart", () => {
    const questionDetails = QUESTION_LINE_CHART;

    it("allows setting dashboard without filters as custom destination and changing it back to default click behavior", () => {
      cy.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("exist");
      cy.get("aside").button("Done").click();

      saveDashboard();

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });

      cy.log("Should navigate to question using router (metabase#33379)");
      dashboardHeader().findByText(TARGET_DASHBOARD.name).should("be.visible");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");
    });

    it("allows setting saved question as custom destination and changing it back to default click behavior", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addSavedQuestionDestination();
      cy.get("aside").button("Done").click();

      saveDashboard();

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.location().should(({ hash, pathname }) => {
        expect(pathname).to.equal("/question");
        const card = deserializeCardFromUrl(hash);
        expect(card.name).to.deep.equal(TARGET_QUESTION.name);
        expect(card.display).to.deep.equal(TARGET_QUESTION.display);
        expect(card.dataset_query.query).to.deep.equal(TARGET_QUESTION.query);
      });

      cy.log("Should navigate to question using router (metabase#33379)");
      cy.findByTestId("view-footer").should("contain", "Showing 5 rows");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");

      cy.go("back");
      testChangingBackToDefaultBehavior();
    });
  });

  describe("full app embedding", () => {
    const questionDetails = QUESTION_LINE_CHART;

    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
    });

    it("allows opening custom URL destination that is not a Metabase instance URL using link (metabase#33379)", () => {
      cy.request("PUT", "/api/setting/site-url", {
        value: "https://localhost:4000/subpath",
      });
      const dashboardDetails = {
        enable_embedding: true,
      };

      const metabaseInstanceUrl = "http://localhost:4000";
      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        addOrUpdateDashboardCard({
          dashboard_id: card.dashboard_id,
          card_id: card.card_id,
          card: {
            id: card.id,
            visualization_settings: {
              click_behavior: {
                type: "link",
                linkType: "url",
                linkTemplate: `${metabaseInstanceUrl}/404`,
              },
            },
          },
        });

        visitEmbeddedPage({
          resource: { dashboard: card.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      clickLineChartPoint();

      cy.log(
        "This is app 404 page, the embed 404 page will have different copy",
      );
      cy.findByRole("main")
        .findByText("The page you asked for couldn't be found.")
        .should("be.visible");
    });
  });
});

const getQuestionDetails = ({ display }) => ({
  display,
  query: {
    "source-table": REVIEWS_ID,
    aggregation: [["count"]],
  },
});

const getDashcardDetails = ({ id, card_id, target_id }) => ({
  id,
  card_id,
  row: 0,
  col: 0,
  size_x: 16,
  size_y: 10,
  visualization_settings: {
    click_behavior: {
      type: "link",
      linkType: "question",
      targetId: target_id,
      parameterMapping: {},
    },
  },
});

/**
 * Duplicated from metabase/lib/card because Cypress can't handle import from there.
 *
 * @param {string} value
 * @returns object
 */
const deserializeCardFromUrl = serialized =>
  JSON.parse(b64hash_to_utf8(serialized));

const clickLineChartPoint = () => {
  cy.findByTestId("dashcard")
    .get("circle.dot")
    .eq(POINT_INDEX)
    /**
     * calling .click() here will result in clicking both
     *     g.voronoi > path[POINT_INDEX]
     * and
     *     circle.dot[POINT_INDEX]
     * To make it worse, clicks count won't be deterministic.
     * Sometimes we'll get an error that one element covers the other.
     * This problem prevails when updating dashboard filter,
     * where the 2 clicks will cancel each other out.
     **/
    .then(([circle]) => {
      const { left, top } = circle.getBoundingClientRect();
      cy.get("body").click(left, top);
    });
};

const addDashboardDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Dashboard").click();
  modal().findByText(TARGET_DASHBOARD.name).click();
};

const addSavedQuestionDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Saved question").click();
  modal().findByText(TARGET_QUESTION.name).click();
};

const assertDrillThroughMenuOpen = () => {
  popover()
    .should("contain", "See these Orders")
    .and("contain", "See this month by week")
    .and("contain", "Break out by…")
    .and("contain", "Automatic insights…")
    .and("contain", "Filter by this value");
};

const testChangingBackToDefaultBehavior = () => {
  cy.log("allows to change click behavior back to the default");

  editDashboard();

  getDashboardCard().realHover().icon("click").click();
  cy.get("aside").icon("close").first().click();
  cy.get("aside").findByText("Open the Metabase drill-through menu").click();
  cy.get("aside").button("Done").click();

  saveDashboard();
  // this is necessary due to query params being reset after saving dashboard
  // with filter applied, which causes dashcard to be refetched
  cy.wait(1);

  clickLineChartPoint();
  assertDrillThroughMenuOpen();
};
