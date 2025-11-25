import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  createQuestionAndDashboard,
  getSignedJwtForResource,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedDashboard,
  mountGuestEmbedQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const WAIT_FOR_INTERNAL_API_REQUESTS_MS = 1000;

describe("scenarios > embedding-sdk > guest-embed-happy-path", () => {
  describe("question", () => {
    const setup = ({ display }: { display?: Card["display"] } = {}) => {
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
        display,
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });

      cy.signOut();
    };

    it("should show question content for unauthorized user", () => {
      setup();

      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/card/*").as("internalApiRequest");

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

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show content of a question with `pivot table` type for unauthorized user", () => {
      setup({ display: "pivot" });

      cy.intercept("/api/card/pivot/*/query*").as("internalApiRequest");

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion(
          { token },
          {
            shouldAssertCardQuery: false,
          },
        );

        cy.wait("@getCardPivotQuery");

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });
  });

  describe("dashboard", () => {
    const setup = ({ display }: { display?: Card["display"] } = {}) => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createQuestionAndDashboard({
        questionDetails: {
          name: "Sample Question",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ["field", ORDERS.QUANTITY, null],
            ],
          },
          display,
        },
        dashboardDetails: {
          name: "Embedding SDK Test Dashboard",
          enable_embedding: true,
          embedding_type: "guest-embed",
        },
      }).then(({ body: { dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");
      });

      cy.signOut();
    };

    it("should show dashboard content for unauthorized user", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/dashboard/*").as("internalApiRequest");

      setup();

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
          cy.findByText("Sample Question").should("be.visible");
        });

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show dashboard content with a pivot card for unauthorized user", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/dashboard/*").as("internalApiRequest");

      setup({ display: "pivot" });

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        });

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });
  });
});
