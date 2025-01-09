import { H } from "e2e/support";
import { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { visitFullAppEmbeddingUrl } from "e2e/support/helpers/e2e-embedding-helpers";
import {
  EMBEDDING_SDK_STORY_HOST,
  getSdkRoot,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  JWT_SHARED_SECRET,
  enableJwtAuth,
} from "e2e/support/helpers/e2e-jwt-helpers";

const STORYBOOK_ID = "embeddingsdk-cypressstaticdashboardwithcors--default";

H.describeEE("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("admin", { skipCache: true });
    H.setTokenFeatures("all");
    enableJwtAuth();

    const textCard = H.getTextCardDetails({ col: 16, text: "Text text card" });
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

    cy.task("signJwt", {
      payload: {
        email: USERS.normal.email,
        exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
      },
      secret: JWT_SHARED_SECRET,
    }).then(jwtToken => {
      const ssoUrl = new URL("/auth/sso", Cypress.config().baseUrl);
      ssoUrl.searchParams.set("jwt", jwtToken);
      ssoUrl.searchParams.set("token", "true");
      cy.request(ssoUrl.toString()).then(({ body }) => {
        cy.wrap(body).as("metabaseSsoResponse");
      });
    });
    cy.get("@metabaseSsoResponse").then(ssoResponse => {
      cy.intercept("GET", "/sso/metabase", ssoResponse);
    });
  });

  it("should not render dashboard when embedding SDK is not enabled", () => {
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": false,
    });
    cy.signOut();

    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: { id: STORYBOOK_ID, viewMode: "story" },
        onBeforeLoad: window => {
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = dashboardId;
        },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText(
        "Failed to fetch the user, the session might be invalid.",
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
        qs: { id: STORYBOOK_ID, viewMode: "story" },
        onBeforeLoad: window => {
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

    getSdkRoot().within(() => {
      cy.findByText("Embedding Sdk Test Dashboard").should("be.visible"); // dashboard title

      cy.findByText("Text text card").should("be.visible"); // text card content

      cy.wait("@dashcardQuery");
      cy.findByText("Test question card").should("be.visible"); // question card content
    });
  });

  it("should not render the SDK on non localhost sites when embedding SDK origins is not set", () => {
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": true,
    });
    cy.signOut();
    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: "http://my-site.local:6006/iframe.html",
        qs: {
          id: STORYBOOK_ID,
          viewMode: "story",
        },
        onBeforeLoad: window => {
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = dashboardId;
        },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText(
        "Failed to fetch the user, the session might be invalid.",
      ).should("be.visible");
    });
  });

  it("should show dashboard content", () => {
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": true,
      "embedding-app-origins-sdk": "my-site.local:6006",
    });
    cy.signOut();
    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: "http://my-site.local:6006/iframe.html",
        qs: { id: STORYBOOK_ID, viewMode: "story" },
        onBeforeLoad: window => {
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

    getSdkRoot().within(() => {
      cy.findByText("Embedding Sdk Test Dashboard").should("be.visible"); // dashboard title

      cy.findByText("Text text card").should("be.visible"); // text card content

      cy.wait("@dashcardQuery");
      cy.findByText("Test question card").should("be.visible"); // question card content
    });
  });
});
