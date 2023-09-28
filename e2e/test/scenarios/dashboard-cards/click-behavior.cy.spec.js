import {
  addOrUpdateDashboardCard,
  restore,
  resetTestTable,
  resyncDatabase,
  visitDashboard,
  editDashboard,
  showDashboardCardActions,
  sidebar,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

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
    const target_id = ORDERS_QUESTION_ID;

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
    const target_id = ORDERS_QUESTION_ID;

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
