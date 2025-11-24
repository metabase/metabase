import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createDashboard,
  createQuestion,
  getSignedJwtForResource,
  getTextCardDetails,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedDashboard,
  mountGuestEmbedQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embedding-happy-path", () => {
  describe("question", () => {
    beforeEach(() => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createQuestion({
        name: "47563",
        enable_embedding: true,
        embedding_type: "guest-embed",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });

      cy.signOut();
    });

    it("should show question content for unauthorized user", () => {
      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion({ token });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    it("should not perform requests to the internal API that require authorization", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/card/*").as("internalApiRequest");

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion({ token });

        // Wait for requests
        cy.wait(2000);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });
  });

  describe("dashboard", () => {
    beforeEach(() => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      const textCard = getTextCardDetails({ col: 16, text: "Test text card" });
      const questionCard = {
        id: ORDERS_DASHBOARD_DASHCARD_ID,
        card_id: ORDERS_QUESTION_ID,
        row: 0,
        col: 0,
        size_x: 16,
        size_y: 8,
        visualization_settings: {
          "card.title": "Test question card",
        },
      };

      createDashboard({
        name: "Embedding SDK Test Dashboard",
        dashcards: [questionCard, textCard],
        enable_embedding: true,
        embedding_type: "guest-embed",
      }).then(({ body: dashboard }) => {
        cy.wrap(dashboard.id).as("dashboardId");
      });

      cy.signOut();
    });

    it("should show dashboard content for unauthorized user", () => {
      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        });
      });
    });

    it("should not perform requests to the internal API that require authorization", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/dashboard/*").as("internalApiRequest");

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        // Wait for requests
        cy.wait(2000);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });
  });
});
