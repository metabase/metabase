/* eslint-disable no-unscoped-text-selectors */
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
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

const STORIES = {
  DE_LOCALE: "embeddingsdk-locale--de-locale",
} as const;

describeSDK(
  "scenarios > embedding-sdk > locale set on MetabaseProvider",
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
      setupJwt();
      cy.signOut();
    });

    it("when locale=de it should display german text", () => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: STORIES.DE_LOCALE,
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.DASHBOARD_ID = ORDERS_DASHBOARD_ID;
        },
      });

      cy.findByText("Als PDF exportieren").should("exist");
    });
  },
);
