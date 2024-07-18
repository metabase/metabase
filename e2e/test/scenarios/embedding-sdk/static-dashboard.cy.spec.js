import {
  restore,
  setTokenFeatures,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import { describeSDK } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
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

    cy.signOut();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/user/current").as("getUser");
  });

  it("should show dashboard content", () => {
    visitFullAppEmbeddingUrl({
      url: "http://localhost:6006/iframe.html",
      qs: { id: "embeddingsdk-staticdashboard--default", viewMode: "story" },
      onBeforeLoad: window => (window.JWT_SHARED_SECRET = JWT_SHARED_SECRET),
    });

    cy.wait("@getUser").then(({ response }) => {
      // eslint-disable-next-line no-console
      console.log("@getUser", { response });

      expect(response?.statusCode).to.equal(200);
    });

    cy.wait("@getDashboard");

    cy.get("#metabase-sdk-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("E-commerce insights").should("be.visible"); // dashboard title

        cy.findByText("Overall business health").should("be.visible"); // tab content title
      });
  });
});
