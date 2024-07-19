import { USERS } from "e2e/support/cypress_data";
import {
  getTextCardDetails,
  restore,
  setTokenFeatures,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import {
  describeSDK,
  EMBEDDING_SDK_STORY_HOST,
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

    cy.createUserFromRawData({
      ...USERS.normal,
      firstName: "Rene",
      lastName: "Mueller",
      email: "rene@example.com",
    });

    const textCard = getTextCardDetails({ size_y: 1 });

    cy.createDashboard(
      {
        name: "Embedding Sdk Test Dashboard",
        dashcards: [textCard],
      },
      { wrapId: true },
    );

    cy.signOut();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  it("should show dashboard content", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: { id: "embeddingsdk-staticdashboard--default", viewMode: "story" },
        onBeforeLoad: window => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = "http://localhost:4000";
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

        cy.findByText("Text card").should("be.visible"); // card content
      });
  });
});
