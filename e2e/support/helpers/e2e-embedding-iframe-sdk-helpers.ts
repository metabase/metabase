import { match } from "ts-pattern";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

import { createApiKey } from "./api";
import { getIframeBody } from "./e2e-embedding-helpers";
import { enableJwtAuth } from "./e2e-jwt-helpers";
import { restore } from "./e2e-setup-helpers";
import { activateToken } from "./e2e-token-helpers";
import {
  enableSamlAuth,
  mockAuthProviderAndJwtSignIn,
} from "./embedding-sdk-testing";

const EMBED_JS_PATH = "http://localhost:4000/app/embed.js";

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
  preferredAuthMethod?: "jwt" | "saml";

  // Options for the test page
  origin?: string;
  insertHtml?: {
    head?: string;
    beforeEmbed?: string;
    afterEmbed?: string;
  };

  onVisitPage?(): void;
}

export const waitForSimpleEmbedIframesToLoad = (n: number = 1) => {
  cy.get("iframe[data-metabase-embed]").should("have.length", n);
  cy.get("iframe[data-iframe-loaded]").should("have.length", n, {
    timeout: 10_000, // the iframe can slow to load, we need to wait to decrease flakiness
  });
};

export const getSimpleEmbedIframeContent = (iframeIndex = 0) => {
  // note that if iframeIndex > 0 you should first await for the iframes to be loaded
  // using waitForSimpleEmbedIframesToLoad and the number of iframes we expect to be loaded

  waitForSimpleEmbedIframesToLoad(iframeIndex + 1);
  return cy
    .get("iframe[data-metabase-embed]")
    .should("be.visible")
    .its(iframeIndex + ".contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty")
    .then(cy.wrap);
};

/**
 * Creates and loads a test fixture for SDK iframe embedding tests
 */
export function loadSdkIframeEmbedTestPage<T extends BaseEmbedTestPageOptions>({
  origin = "",
  onVisitPage,
  ...options
}: T) {
  const testPageSource = getSdkIframeEmbedHtml({
    target: "#metabase-embed-container",
    instanceUrl: "http://localhost:4000",
    origin,
    ...options,
  });

  const testPageUrl = `${origin}/sdk-iframe-test-page`;

  cy.intercept("GET", testPageUrl, {
    body: testPageSource,
    headers: { "content-type": "text/html" },
  }).as("dynamicPage");

  cy.visit(testPageUrl, { onLoad: onVisitPage });
  cy.title().should("include", "Metabase Embed Test");

  return getIframeBody();
}

/**
 * Base HTML template for embedding test pages
 */
function getSdkIframeEmbedHtml({
  insertHtml,
  origin,
  ...embedConfig
}: BaseEmbedTestPageOptions) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
      ${insertHtml?.head ?? ""}

      <style>
        body {
          margin: 0;
        }

        #metabase-embed-container {
          height: 100vh;
        }
      </style>
    </head>
    <body>
      ${insertHtml?.beforeEmbed ?? ""}
      <div id="metabase-embed-container"></div>
      ${insertHtml?.afterEmbed ?? ""}

      <script src="${EMBED_JS_PATH}"></script>

      <script>
        const { MetabaseEmbed } = window["metabase.embed"] ?? {};

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

/**
 * Prepares the testing environment for sdk iframe embedding tests.
 *
 * @param {boolean} withTokenFeatures - Whether to enable token features.
 * @param {EnabledAuthMethods[]} enabledAuthMethods - The authentication methods to enable.
 */
export function prepareSdkIframeEmbedTest({
  withTokenFeatures = true,
  enabledAuthMethods = ["jwt"],
  signOut = false,
}: {
  withTokenFeatures?: boolean;
  enabledAuthMethods?: EnabledAuthMethods[];
  signOut?: boolean;
} = {}) {
  restore();
  cy.signInAsAdmin();

  if (withTokenFeatures) {
    activateToken("bleeding-edge");
  } else {
    activateToken("starter");
  }

  cy.request("PUT", "/api/setting/enable-embedding-interactive", {
    value: true,
  });

  cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
  cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
  cy.intercept("GET", "/api/dashboard/*").as("getDashboard");

  setupMockAuthProviders(enabledAuthMethods);

  if (signOut) {
    cy.signOut();
  }
}

type EnabledAuthMethods = "jwt" | "saml" | "api-key";

function setupMockAuthProviders(enabledAuthMethods: EnabledAuthMethods[]) {
  if (enabledAuthMethods.includes("jwt")) {
    enableJwtAuth();
    mockAuthProviderAndJwtSignIn();
  }

  // Doesn't actually allow us to login via SAML, but this tricks
  // Metabase into thinking that SAML is enabled and configured.
  if (enabledAuthMethods.includes("saml")) {
    enableSamlAuth();
  }

  if (enabledAuthMethods.includes("api-key")) {
    const ADMIN_GROUP_ID = 2;

    createApiKey("test iframe sdk embedding", ADMIN_GROUP_ID).then(
      ({ body }) => {
        cy.wrap(body.unmasked_key).as("apiKey");
      },
    );
  }
}

export const getNewEmbedScriptTag = ({
  loadType = "defer",
}: {
  loadType?: "sync" | "async" | "defer";
} = {}) => {
  const loadTypeAttribute = match(loadType)
    .with("sync", () => "")
    .with("async", () => "async")
    .with("defer", () => "defer")
    .exhaustive();

  return `
    <script src="${EMBED_JS_PATH}" ${loadTypeAttribute}></script>
    <script>
      function defineMetabaseConfig(settings) {
        window.metabaseConfig = settings;
      }
    </script>
  `;
};

export const getNewEmbedConfigurationScript = ({
  instanceUrl = "http://localhost:4000",
  theme,
}: {
  instanceUrl?: string;
  theme?: MetabaseTheme;
} = {}) => {
  return `
    <script>
      defineMetabaseConfig({
        instanceUrl: "${instanceUrl}",
        theme: ${JSON.stringify(theme)},
      });
    </script>
  `;
};

export const visitCustomHtmlPage = (
  html: string,
  {
    origin = "",
    onVisitPage,
  }: {
    origin?: string;
    onVisitPage?: () => void;
  } = {},
) => {
  const testPageUrl = `${origin}/custom-html-page`;
  cy.intercept("GET", testPageUrl, {
    body: html,
    headers: { "content-type": "text/html" },
  }).as("dynamicPage");

  cy.visit(testPageUrl, { onLoad: onVisitPage });

  return cy;
};
