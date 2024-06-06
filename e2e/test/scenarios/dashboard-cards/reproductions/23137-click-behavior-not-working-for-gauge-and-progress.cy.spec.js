import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  addOrUpdateDashboardCard,
  queryBuilderHeader,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { REVIEWS_ID } = SAMPLE_DATABASE;

const GAUGE_QUESTION_DETAILS = {
  display: "gauge",
  query: {
    "source-table": REVIEWS_ID,
    aggregation: [["count"]],
  },
};

const PROGRESS_QUESTION_DETAILS = {
  display: "progress",
  query: {
    "source-table": REVIEWS_ID,
    aggregation: [["count"]],
  },
};

describe("issue 23137", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should navigate to a target from a gauge card (metabase#23137)", () => {
    const target_id = ORDERS_QUESTION_ID;

    cy.createQuestionAndDashboard({
      questionDetails: GAUGE_QUESTION_DETAILS,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          id,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "question",
              targetId: target_id,
              parameterMapping: {},
            },
          },
        },
      });

      visitDashboard(dashboard_id);
    });

    cy.findByTestId("gauge-arc-1").click();
    cy.wait("@cardQuery");
    queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });

  it("should navigate to a target from a progress card (metabase#23137)", () => {
    const target_id = ORDERS_QUESTION_ID;

    cy.createQuestionAndDashboard({
      questionDetails: PROGRESS_QUESTION_DETAILS,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          id,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "question",
              targetId: target_id,
              parameterMapping: {},
            },
          },
        },
      });

      visitDashboard(dashboard_id);
    });

    cy.findByTestId("progress-bar").click();
    cy.wait("@cardQuery");
    queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });
});
