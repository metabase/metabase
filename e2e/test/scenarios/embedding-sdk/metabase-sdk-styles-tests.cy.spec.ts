/* eslint-disable no-unscoped-text-selectors */
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
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

const DEFAULT_CHROME_FONT_FAMILY = "Times";

describeSDK("scenarios > embedding-sdk > static-dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupJwt();
  });

  it("something", () => {
    visitFullAppEmbeddingUrl({
      url: EMBEDDING_SDK_STORY_HOST,
      qs: {
        id: "embeddingsdk-styles-tests--no-styles-success",
        viewMode: "story",
      },
      onBeforeLoad: (window: any) => {
        window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
        window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
        window.QUESTION_ID = ORDERS_QUESTION_ID;
      },
    });

    cy.findByText("This is outside of the provider").should(
      "have.css",
      "font-family",
      DEFAULT_CHROME_FONT_FAMILY,
    );

    cy.findByText("This is inside of the provider").should(
      "have.css",
      "font-family",
      DEFAULT_CHROME_FONT_FAMILY,
    );

    cy.findByText("Product ID").should(
      "have.css",
      "font-family",
      "Lato, sans-serif",
    );
  });
});
