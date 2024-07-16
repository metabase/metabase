import { restore, visitFullAppEmbeddingUrl } from "e2e/support/helpers";
import { describeSDK } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

describeSDK("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
  });

  it("should show dashboard content", () => {
    visitFullAppEmbeddingUrl({
      url: "http://localhost:6006/iframe.html",
      qs: { id: "embeddingsdk-staticdashboard--default", viewMode: "story" },
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
