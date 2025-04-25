import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

/**
 * Base interface for SDK iframe embedding test page options
 */
interface BaseEmbedTestPageOptions {
  apiKey: string;
  resourceId: number | string;
  additionalConfig?: Record<string, unknown>;
}

/**
 * Options for theme-based embedding test pages
 */
export interface ThemeEmbedTestPageOptions extends BaseEmbedTestPageOptions {
  theme: MetabaseTheme;
  includeThemeControls?: boolean;
  includeResizeControl?: boolean;
}

/**
 * Options for standard SDK iframe embedding test pages
 */
export interface SdkIframeEmbedTestPageOptions
  extends BaseEmbedTestPageOptions {
  resourceType: "dashboard" | "question";
  theme: MetabaseTheme;
  includeThemeSwitch?: boolean;
}

/**
 * Sets up common embedding test environment
 * @param groupId - Group ID to create API key for
 */
export function setupEmbeddingTest(groupId: number) {
  const { H } = cy;

  H.restore();
  cy.signInAsAdmin();

  H.mockSessionPropertiesTokenFeatures({ embedding_iframe_sdk: true });

  // Enable all enterprise features including embedding_iframe_sdk
  H.setTokenFeatures("all");

  H.createApiKey("Test SDK Embedding Key", groupId).then(({ body }) => {
    cy.wrap(body.unmasked_key).as("apiKey");
    cy.log(`created test api key "${body.unmasked_key}"`);
  });

  cy.log("Enabling embedding globally");
  cy.request("PUT", "/api/setting/enable-embedding-static", {
    value: true,
  });

  cy.log("Enabling interactive embedding");
  cy.request("PUT", "/api/setting/enable-embedding-interactive", {
    value: true,
  });

  cy.log("Setting interactive embedding origins");
  cy.request("PUT", "/api/setting/embedding-app-origins-interactive", {
    value: "http://localhost:3000",
  });
}

/**
 * Creates and loads a test fixture for SDK iframe embedding tests
 */
export function loadSdkEmbedIframeTestPage<T extends BaseEmbedTestPageOptions>(
  options: T,
  getHtml: (options: T) => string,
) {
  const testPageSource = getHtml(options);

  cy.intercept("GET", "/sdk-iframe-test-page", {
    body: testPageSource,
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

/**
 * Enables embedding for a specific resource
 * @param resourceType - Type of resource (dashboard or question)
 * @param resourceId - ID of the resource
 */
export function enableResourceEmbedding(
  resourceType: "dashboard" | "question",
  resourceId: number,
) {
  cy.log(`Enabling embedding for the ${resourceType}`);
  cy.request("PUT", `/api/${resourceType}/${resourceId}`, {
    enable_embedding: true,
  });
}

/**
 * Gets the entity ID for a specific resource
 * @param resourceType - Type of resource (dashboard or question)
 * @param resourceId - ID of the resource
 * @returns Promise resolving to the entity ID
 */
export function getResourceEntityId(
  resourceType: "dashboard" | "question",
  resourceId: number,
) {
  const apiPath = resourceType === "question" ? "card" : resourceType;
  return cy.request("GET", `/api/${apiPath}/${resourceId}`).then(({ body }) => {
    return body.entity_id;
  });
}

/**
 * Base HTML template for embedding test pages
 */
export function getBaseIframeHtml(
  options: BaseEmbedTestPageOptions,
  embedConfig: Record<string, unknown>,
  additionalHead = "",
  additionalBody = "",
) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
      ${additionalHead}
    </head>
    <body>
      <script src="/app/embed.v1.js"></script>

      <div id="metabase-embed-container"></div>
      ${additionalBody}

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
          url: "http://localhost:4000",
          apiKey: "${options.apiKey}",
          ${Object.entries(embedConfig)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join(",\n          ")}
          ${options.additionalConfig ? `...${JSON.stringify(options.additionalConfig)},` : ""}
        });
      </script>
    </body>
    </html>
  `;
}
