import {
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

describeSDK("scenarios > embedding-sdk > editable-dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupJwt();
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": true,
    });

    cy.createDashboard(
      {
        name: "Embedding SDK Test Dashboard",
      },
      { wrapId: true },
    );

    cy.signOut();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/user/current").as("getUser");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("Should not open sidesheet when clicking last edit info (metabase#48354)", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: "embeddingsdk-editabledashboard--default",
          viewMode: "story",
        },
        onBeforeLoad: window => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = dashboardId;
        },
      });
    });

    cy.get("#metabase-sdk-root")
      .findByText("Edited a few seconds ago by Bobby Tables")
      .click()
      .should("be.visible");
    cy.findByRole("heading", { name: "Info" }).should("not.exist");
    cy.findByRole("tab", { name: "Overview" }).should("not.exist");
    cy.findByRole("tab", { name: "History" }).should("not.exist");
  });
});
