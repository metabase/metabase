import {
  ALL_USERS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > entity id", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.mockSessionPropertiesTokenFeatures({ embedding_iframe_sdk: true });
    H.setTokenFeatures("all");

    H.createApiKey("Test SDK Embedding Key", ALL_USERS_GROUP_ID).then(
      ({ body }) => {
        cy.wrap(body.unmasked_key).as("apiKey");
      },
    );

    cy.request("PUT", "/api/setting/enable-embedding-interactive", {
      value: true,
    });
  });

  it("should create iframe and authenticate with API key using entity ID", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      H.getEntityIdFromResource("dashboard", ORDERS_DASHBOARD_ID).then(
        (dashboardId) => {
          const frame = H.loadSdkIframeEmbedTestPage({ apiKey, dashboardId });

          frame.contains("Orders in a dashboard").should("be.visible");
        },
      );
    });
  });

  it("should embed question using entity ID", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      H.getEntityIdFromResource("question", ORDERS_QUESTION_ID).then(
        (questionId) => {
          const frame = H.loadSdkIframeEmbedTestPage({ apiKey, questionId });
          frame.contains("Orders").should("be.visible");
        },
      );
    });
  });
});
