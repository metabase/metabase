import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

import { createApiKey } from "./api";
import {
  mockSessionPropertiesTokenFeatures,
  setTokenFeatures,
} from "./e2e-enterprise-helpers";
import { restore } from "./e2e-setup-helpers";

const EMBED_JS_PATH = "/app/embed.v1.js";

/**
 * Base interface for SDK iframe embedding test page options
 */
export interface BaseEmbedTestPageOptions {
  // Options for the embed route
  target?: string;
  apiKey?: string;
  instanceUrl?: string;
  dashboardId?: number | string;
  questionId?: number | string;
  template?: "exploration";
  theme?: MetabaseTheme;
  locale?: string;

  // Options for the test page
  skipPageVisit?: boolean;
  insertHtml?: {
    head?: string;
    beforeEmbed?: string;
    afterEmbed?: string;
  };
}

/**
 * Creates and loads a test fixture for SDK iframe embedding tests
 */
export function loadSdkIframeEmbedTestPage<T extends BaseEmbedTestPageOptions>({
  skipPageVisit = false,
  ...options
}: T) {
  return cy.get("@apiKey").then((apiKey) => {
    const testPageSource = getSdkIframeEmbedHtml({
      target: "#metabase-embed-container",
      apiKey,
      instanceUrl: "http://localhost:4000",
      ...options,
    });

    cy.intercept("GET", "/sdk-iframe-test-page", {
      body: testPageSource,
      headers: { "content-type": "text/html" },
    }).as("dynamicPage");

    if (skipPageVisit) {
      return;
    }

    cy.visit("/sdk-iframe-test-page");

    return cy
      .get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .its("body")
      .should("not.be.empty");
  });
}

/**
 * Base HTML template for embedding test pages
 */
function getSdkIframeEmbedHtml({
  insertHtml,
  ...embedConfig
}: BaseEmbedTestPageOptions) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
      ${insertHtml?.head ?? ""}
    </head>
    <body>
      <script src="${EMBED_JS_PATH}"></script>

      ${insertHtml?.beforeEmbed ?? ""}
      <div id="metabase-embed-container"></div>
      ${insertHtml?.afterEmbed ?? ""}

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

        try {
          window.embed = new MetabaseEmbed({
            ${Object.entries(embedConfig)
              .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
              .join(",\n          ")}
          });
        } catch (error) {
          console.error(error.message)
        }
      </script>
    </body>
    </html>
  `;
}

export function prepareSdkIframeEmbedTest({
  withTokenFeatures = true,
}: {
  withTokenFeatures?: boolean;
} = {}) {
  // TODO: use a less privileged group that has "Our analytics" view permission
  const ADMIN_GROUP_ID = 2;

  restore();
  cy.signInAsAdmin();

  if (withTokenFeatures) {
    setTokenFeatures("all");
    mockSessionPropertiesTokenFeatures({ embedding_iframe_sdk: true });
  }

  createApiKey("test iframe sdk embedding", ADMIN_GROUP_ID).then(({ body }) => {
    cy.wrap(body.unmasked_key).as("apiKey");
  });

  cy.request("PUT", "/api/setting/enable-embedding-interactive", {
    value: true,
  });

  cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
  cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
  cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
}
