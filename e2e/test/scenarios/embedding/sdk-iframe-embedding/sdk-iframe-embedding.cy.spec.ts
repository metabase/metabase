const { H } = cy;

import {
  ALL_USERS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

interface SdkIframeEmbedTestPageOptions {
  resourceType: "dashboard" | "question";
  resourceId: number | string;
  apiKey: string;
  theme: MetabaseTheme;
  includeThemeSwitch?: boolean;
  additionalConfig?: Record<string, unknown>;
}

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

    cy.log("Creating API key for testing");
    H.createApiKey("Test SDK Embedding Key", ALL_USERS_GROUP_ID).then(
      ({ body }) => {
        cy.wrap(body.unmasked_key).as("apiKey");
      },
    );

    cy.log("Enabling embedding globally");
    cy.request("PUT", "/api/setting/enable-embedding-static", {
      value: true,
    });
  });

  it("should create iframe and authenticate with API key for dashboard", () => {
    cy.log("Enabling embedding for the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
    });

    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = loadSdkEmbedIframeTestPage({
        resourceType: "dashboard",
        resourceId: ORDERS_DASHBOARD_ID,
        apiKey,
        theme: LIGHT_THEME,
      });

      cy.log("Verifying dashboard content is visible");
      frame.contains("Orders in a dashboard").should("be.visible");
    });
  });
});

/**
 * Creates and loads a test fixture for SDK iframe embedding tests
 */
function loadSdkEmbedIframeTestPage(options: SdkIframeEmbedTestPageOptions) {
  const testPage = getIframeTestPageHtml(options);

  cy.intercept("GET", "/sdk-iframe-test-page", {
    body: testPage,
    headers: { "content-type": "text/html" },
  }).as("dynamicPage");

  cy.visit("/sdk-iframe-test-page");

  return cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty")
    .find("[data-testid='embed-frame']")
    .should("be.visible");
}

function getIframeTestPageHtml(options: SdkIframeEmbedTestPageOptions): string {
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

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
    </head>
    <body>
      <script src="http://localhost:3000/app/embed.js"></script>

      <div id="metabase-embed-container"></div>
      ${themeSwitch}

      <style>
        body {
          margin: 0;
        }

        #metabase-embed-container {
          height: 100vh;
        }
      </style>

      <script>
        const { MetabaseEmbed } = window["metabase.embed"];

        const embed = new MetabaseEmbed({
          target: "#metabase-embed-container",
          url: "http://localhost:3000",
          ${resourceIdProp}: ${options.resourceId},
          apiKey: "${options.apiKey}",
          theme: ${JSON.stringify(options.theme)},
          ${options.additionalConfig ? `...${JSON.stringify(options.additionalConfig)},` : ""}
        });
      </script>
    </body>
    </html>
  `;
}
