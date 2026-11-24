import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createNativeQuestion,
  createQuestionAndDashboard,
  getSignedJwtForResource,
  goalLine,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedDashboard,
  mountGuestEmbedQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type {
  CardId,
  DashboardId,
  GoalSourceResults,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embed-dynamic-goals", () => {
  beforeEach(() => {
    signInAsAdminAndSetupGuestEmbedding({ token: "starter" });

    createNativeQuestion({
      name: "Goal source",
      native: { query: "SELECT 400 AS TARGET" },
    }).then(({ body: source }) => {
      cy.wrap(source.id).as("sourceId");

      createQuestionAndDashboard({
        questionDetails: {
          name: "Chart with a dynamic goal",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          display: "line",
          enable_embedding: true,
          embedding_type: "guest-embed",
          visualization_settings: {
            "graph.metrics": ["count"],
            "graph.dimensions": ["CREATED_AT"],
            "graph.show_goal": true,
            "graph.goal_value": {
              type: "card",
              id: source.id,
              column: "TARGET",
            },
          },
        },
        dashboardDetails: {
          name: "Dashboard with a dynamic goal",
          enable_embedding: true,
          embedding_type: "guest-embed",
        },
      }).then(({ body: { card_id, dashboard_id } }) => {
        cy.wrap(card_id).as("questionId");
        cy.wrap(dashboard_id).as("dashboardId");
      });
    });

    cy.signOut();

    cy.intercept("GET", "/api/embed/card/*/goal-values").as("cardGoalValues");
    cy.intercept(
      "GET",
      "/api/embed/dashboard/*/dashcard/*/card/*/goal-values",
    ).as("dashcardGoalValues");
  });

  it("should draw the goal line of a guest embedded question from its goal values route", () => {
    cy.get<CardId>("@questionId").then(async (questionId) => {
      const token = await getSignedJwtForResource({
        resourceId: questionId,
        resourceType: "question",
      });

      mountGuestEmbedQuestion({ token });
    });

    getSdkRoot().within(() => {
      goalLine().should("exist");
    });
    assertGoalSourceAnswered("@cardGoalValues");
  });

  it("should draw the goal line of a guest embedded dashcard from its goal values route", () => {
    cy.get<DashboardId>("@dashboardId").then(async (dashboardId) => {
      const token = await getSignedJwtForResource({
        resourceId: Number(dashboardId),
        resourceType: "dashboard",
      });

      mountGuestEmbedDashboard({ token });
    });

    getSdkRoot().within(() => {
      goalLine().should("exist");
    });
    assertGoalSourceAnswered("@dashcardGoalValues");
  });
});

function assertGoalSourceAnswered(alias: string) {
  cy.get<CardId>("@sourceId").then((sourceId) => {
    cy.wait(alias).then(({ response }) => {
      const body: GoalSourceResults | undefined = response?.body;
      expect(body?.card?.[sourceId]?.status).to.equal("completed");
    });
  });
}
