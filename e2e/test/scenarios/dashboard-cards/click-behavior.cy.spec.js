import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  editDashboard,
  resetTestTable,
  restore,
  resyncDatabase,
  showDashboardCardActions,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";

const { REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
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
