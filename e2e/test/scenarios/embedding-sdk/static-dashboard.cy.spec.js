import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  getTextCardDetails,
  restore,
  setTokenFeatures,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import {
  EMBEDDING_SDK_STORY_HOST,
  describeSDK,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  JWT_SHARED_SECRET,
  setupJwt,
} from "e2e/support/helpers/e2e-jwt-helpers";

describeSDK("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupJwt();

    const textCard = getTextCardDetails({ col: 16, text: "Text text card" });
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

    cy.createDashboard(
      {
        name: "Embedding Sdk Test Dashboard",
        dashcards: [questionCard, textCard],
      },
      { wrapId: true },
    );

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/user/current").as("getUser");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not render dashboard when embedding SDK is not enabled", () => {
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": false,
    });
    cy.signOut();

    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: { id: "embeddingsdk-staticdashboard--default", viewMode: "story" },
        onBeforeLoad: window => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = dashboardId;
        },
      });
    });

    cy.get("#metabase-sdk-root").within(() => {
      cy.findByText("Error").should("be.visible");
      cy.findByText(
        "Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token",
      ).should("be.visible");
    });
  });

  it("should show dashboard content", () => {
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": true,
    });
    cy.signOut();
    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: { id: "embeddingsdk-staticdashboard--default", viewMode: "story" },
        onBeforeLoad: window => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = dashboardId;
        },
      });
    });

    cy.wait("@getUser").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    cy.wait("@getDashboard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    cy.get("#metabase-sdk-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("Embedding Sdk Test Dashboard").should("be.visible"); // dashboard title

        cy.findByText("Text text card").should("be.visible"); // text card content

        cy.wait("@dashcardQuery");
        cy.findByText("Test question card").should("be.visible"); // question card content
      });
  });
});
