const { H } = cy;

import {
  ALL_USERS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type SdkIframeEmbedTestPageOptions,
  getBaseSdkIframeEmbedHtml,
  loadSdkEmbedIframeTestPage,
} from "e2e/support/helpers/e2e-embedding-iframe-sdk-helpers";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

const LIGHT_THEME: MetabaseTheme = {
  colors: {
    brand: "#509EE3",
    "text-primary": "#2D3B45",
    "text-secondary": "#7C8896",
    "text-tertiary": "#B8BBC3",
    background: "#ffffff",
  },
};

const DARK_THEME: MetabaseTheme = {
  colors: {
    background: "#2d2d3d",
    "text-primary": "#fff",
    "text-secondary": "#b3b3b3",
    "text-tertiary": "#8a8a8a",
    brand: "#ff9900",
  },
};

describe("scenarios > embedding > sdk iframe embedding", () => {
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

  it("should create iframe and authenticate with API key for dashboard", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = loadSdkEmbedIframeTestPage(
        {
          resourceType: "dashboard",
          resourceId: ORDERS_DASHBOARD_ID,
          apiKey,
          theme: LIGHT_THEME,
        },
        getSdkIframeTestPageHtml,
      );

      frame.contains("Orders in a dashboard").should("be.visible");
    });
  });

  it("should create iframe and authenticate with API key for question", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = loadSdkEmbedIframeTestPage(
        {
          resourceType: "question",
          resourceId: ORDERS_QUESTION_ID,
          apiKey,
          theme: LIGHT_THEME,
        },
        getSdkIframeTestPageHtml,
      );

      frame.contains("Orders").should("be.visible");
    });
  });
});

function getSdkIframeTestPageHtml(
  options: SdkIframeEmbedTestPageOptions,
): string {
  const resourceIdProp =
    options.resourceType === "dashboard" ? "dashboardId" : "questionId";

  const themeSwitch = options.includeThemeSwitch
    ? `
      <button id="theme-switch" onclick="switchTheme()">Switch Theme</button>
      <script>
        let isDarkTheme = false;

        function switchTheme() {
          isDarkTheme = !isDarkTheme;
          embed.updateSettings({
            theme: isDarkTheme ? ${JSON.stringify(DARK_THEME)} : ${JSON.stringify(
              LIGHT_THEME,
            )}
          });
        }
      </script>
      `
    : "";

  return getBaseSdkIframeEmbedHtml(
    options,
    {
      [resourceIdProp]: options.resourceId,
      theme: options.theme,
    },
    "",
    themeSwitch,
  );
}
