import { match } from "ts-pattern";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";
import type { CreateApiKeyResponse } from "metabase-types/api";

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
  // Passed to defineMetabaseConfig
  metabaseConfig?: {
    instanceUrl?: string;
    apiKey?: string;
    useExistingUserSession?: boolean;
    theme?: MetabaseTheme;
    preferredAuthMethod?: "jwt" | "saml";
    locale?: string;
  };

  // The element to embed
  element: "metabase-dashboard" | "metabase-question";

  // Attributes passed serialized to the element
  attributes: {
    dashboardId?: number | string;
    questionId?: number | string;
    [key: string]: any;
  };

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

  // await at least ${iframeIndex} iframes to be loaded
  cy.get("iframe[data-metabase-embed]").should(
    "have.length.greaterThan",
    iframeIndex,
  );
  cy.get("iframe[data-iframe-loaded]").should(
    "have.length.greaterThan",
    iframeIndex,
    {
      timeout: 10_000, // the iframe can slow to load, we need to wait to decrease flakiness
    },
  );

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
export function loadSdkIframeEmbedTestPage({
  origin = "",
  onVisitPage,
  ...options
}: BaseEmbedTestPageOptions) {
  const testPageSource = getSdkIframeEmbedHtml(options);

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
  metabaseConfig,
  element,
  attributes,
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

        metabase-question, metabase-dashboard {
          height: 100vh;
        }
      </style>
    </head>
    <body>
      ${getNewEmbedScriptTag({ loadType: "sync" })}
      ${getNewEmbedConfigurationScript(metabaseConfig)}

      ${insertHtml?.beforeEmbed ?? ""}

      <${element} ${convertPropertiesToEmbedTagAttributes(attributes)} />

      ${insertHtml?.afterEmbed ?? ""}
    </body>
    </html>
  `;
}

const convertPropertiesToEmbedTagAttributes = (
  attributes: BaseEmbedTestPageOptions["attributes"],
) => {
  return Object.entries(attributes)
    .map(([key, value]) => {
      if (key === "element") {
        return "";
      }
      const attributeKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      const attributeValue = match(typeof value)
        .with("string", () => value)
        .with("boolean", () => value.toString())
        .otherwise(() => JSON.stringify(value));

      return `${attributeKey}='${attributeValue}'`;
    })
    .join(" ");
};

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

  cy.request("PUT", "/api/setting/enable-embedding-simple", {
    value: true,
  });

  cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
  cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
  cy.intercept("GET", "/api/dashboard/*").as("getDashboard");

  setupMockAuthProviders(enabledAuthMethods);

  mockEmbedJsToDevServer();

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
      ({ body }: { body: CreateApiKeyResponse }) => {
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
  apiKey,
  useExistingUserSession,
  preferredAuthMethod,
  locale,
}: {
  instanceUrl?: string;
  theme?: MetabaseTheme;
  apiKey?: string;
  useExistingUserSession?: boolean;
  preferredAuthMethod?: "jwt" | "saml";
  locale?: string;
} = {}) => {
  const config = {
    instanceUrl,
    apiKey,
    useExistingUserSession,
    theme,
    preferredAuthMethod,
    locale,
  };

  return `
    <script>
      defineMetabaseConfig(${JSON.stringify(config, null, 2)});
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

/**
 * Mock the embed.js file to point it to the rspack dev server when not in CI.
 *
 * When running E2E tests locally we can usually benefit from hot reload.
 * When we're testing something that uses the embed.js file though that file is always referenced
 * from the uberjar so if we change it, we'd need to build the uberjar again.
 *
 * This function checks if the rspack dev server is available and if so, it mocks the embed.js file
 * to point it to the rspack dev server.
 */
export const mockEmbedJsToDevServer = () => {
  if (Cypress.env("CI")) {
    // we don't need this logic in CI, let's skip the check to avoid slowing down the tests
    return;
  }

  // We use `cy.exec` with curl because both `fetch` and `cy.request` have downsides:
  // - if we use `fetch`, it will show up as failed request in the browser polluting the logs
  // - if we use `cy.request`, it will fail the test even if `failOnStatusCode` is false
  cy.exec("curl --silent --head --fail http://localhost:8080/app/embed.js", {
    failOnNonZeroExit: false,
    log: false,
  }).then((result) => {
    const isHotReloadAvailable = result.code === 0;

    if (isHotReloadAvailable) {
      cy.intercept("GET", EMBED_JS_PATH, (req) => {
        req.redirect("http://localhost:8080/app/embed.js");
      });
    }
  });
};
