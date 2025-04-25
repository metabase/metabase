import {
  ALL_USERS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { SdkIframeEmbedTestPageOptions } from "e2e/support/helpers";
import * as H from "e2e/support/helpers";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

const THEME: MetabaseTheme = {
  colors: {
    brand: "#509EE3",
    "text-primary": "#2D3B45",
    "text-secondary": "#7C8896",
    "text-tertiary": "#B8BBC3",
    background: "#ffffff",
  },
};

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
    cy.log("Testing dashboard embedding with entity ID");

    cy.get<string>("@apiKey").then((apiKey) => {
      H.getResourceEntityId("dashboard", ORDERS_DASHBOARD_ID).then(
        (entityId) => {
          const frame = H.loadSdkEmbedIframeTestPage(
            {
              resourceType: "dashboard",
              resourceId: entityId,
              apiKey,
              theme: THEME,
            },
            getEntityIdTestPageHtml,
          );

          frame.contains("Orders in a dashboard").should("be.visible");
        },
      );
    });
  });

  it("should embed question using entity ID", () => {
    cy.log("Testing question embedding with entity ID");

    cy.get<string>("@apiKey").then((apiKey) => {
      H.getResourceEntityId("question", ORDERS_QUESTION_ID).then((entityId) => {
        const frame = H.loadSdkEmbedIframeTestPage(
          {
            resourceType: "question",
            resourceId: entityId,
            apiKey,
            theme: THEME,
          },
          getEntityIdTestPageHtml,
        );

        frame.contains("Orders").should("be.visible");
      });
    });
  });
});

function getEntityIdTestPageHtml(
  options: SdkIframeEmbedTestPageOptions,
): string {
  const resourceIdProp =
    options.resourceType === "dashboard" ? "dashboardId" : "questionId";

  return H.getBaseSdkIframeEmbedHtml(
    options,
    {
      [resourceIdProp]: options.resourceId,
      theme: options.theme,
    },
    "",
    "",
  );
}
