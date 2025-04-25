const { H } = cy;

import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const LIGHT_THEME = {
  colors: {
    brand: "#509EE3",
    "text-primary": "#2D3B45",
    "text-secondary": "#7C8896",
    "text-tertiary": "#B8BBC3",
    background: "#ffffff",
  },
};

const DARK_THEME = {
  colors: {
    background: "#2d2d3d",
    "text-primary": "#fff",
    "text-secondary": "#b3b3b3",
    "text-tertiary": "#8a8a8a",
    brand: "#ff9900",
  },
};

describe("scenarios > embedding > sdk iframe embedding", () => {
  let apiKey;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.log("Creating API key for testing");
    H.createApiKey("Test SDK Embedding Key", "all").then(({ body }) => {
      apiKey = body.unmasked_key;
    });

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

    cy.log("Creating test page with embed.js");
    const testPage = createTestPage({
      resourceType: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: LIGHT_THEME,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying iframe creation and loading");
    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .its("body")
      .should("not.be.empty")
      .find("[data-testid='embed-frame']")
      .should("be.visible");

    cy.log("Verifying dashboard content is visible");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .contains("Orders in a dashboard")
      .should("be.visible");
  });

  it("should create iframe and authenticate with API key for question", () => {
    cy.log("Enabling embedding for the question");
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    cy.log("Creating test page with embed.js");
    const testPage = createTestPage({
      resourceType: "question",
      resourceId: ORDERS_QUESTION_ID,
      apiKey,
      theme: LIGHT_THEME,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying iframe creation and loading");
    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .its("body")
      .should("not.be.empty")
      .find("[data-testid='embed-frame']")
      .should("be.visible");

    cy.log("Verifying question content is visible");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .contains("Orders")
      .should("be.visible");
  });

  it("should switch between light and dark themes", () => {
    cy.log("Enabling embedding for the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
    });

    cy.log("Creating test page with embed.js and theme switching");
    const testPage = createTestPage({
      resourceType: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: LIGHT_THEME,
      includeThemeSwitch: true,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying initial light theme");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .should("have.css", "background-color", "rgb(255, 255, 255)");

    cy.log("Switching to dark theme");
    cy.get("#theme-switch").click();

    cy.log("Verifying dark theme application");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .should("have.css", "background-color", "rgb(45, 45, 61)");
  });
});

function createTestPage({
  resourceType,
  resourceId,
  apiKey,
  theme,
  includeThemeSwitch = false,
}) {
  const resourceIdProp =
    resourceType === "dashboard" ? "dashboardId" : "questionId";

  const themeSwitch = includeThemeSwitch
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
          ${resourceIdProp}: ${resourceId},
          apiKey: "${apiKey}",
          theme: ${JSON.stringify(theme)},
        });
      </script>
    </body>
    </html>
  `;
}
