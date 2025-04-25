const { H } = cy;

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const CUSTOM_THEME = {
  colors: {
    brand: "#FF5733",
    "text-primary": "#2C3E50",
    "text-secondary": "#95A5A6",
    "text-tertiary": "#BDC3C7",
    background: "#ECF0F1",
  },
  fonts: {
    regular: "'Roboto', sans-serif",
    bold: "'Roboto', sans-serif",
    mono: "'Roboto Mono', monospace",
  },
};

describe("scenarios > embedding > sdk iframe embedding > themes and browser", () => {
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

    cy.log("Enabling embedding for the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
    });
  });

  it("should apply custom theme with fonts and colors", () => {
    cy.log("Creating test page with custom theme");
    const testPage = createTestPage({
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: CUSTOM_THEME,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying custom theme application");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .should("have.css", "background-color", "rgb(236, 240, 241)")
      .and("have.css", "font-family", "'Roboto', sans-serif");

    cy.log("Verifying text colors");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='dashboard-name']")
      .should("have.css", "color", "rgb(44, 62, 80)");
  });

  it("should handle dynamic theme updates", () => {
    cy.log("Creating test page with theme controls");
    const testPage = createTestPage({
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: CUSTOM_THEME,
      includeThemeControls: true,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Changing brand color to green");
    cy.get("#brand-color").invoke("val", "#00FF00").trigger("change");

    cy.log("Verifying brand color update");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='brand-element']")
      .should("have.css", "color", "rgb(0, 255, 0)");
  });

  it("should verify iframe sandbox attributes", () => {
    cy.log("Creating test page for sandbox attribute verification");
    const testPage = createTestPage({
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: CUSTOM_THEME,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying iframe sandbox attributes");
    cy.get("iframe").should(($iframe) => {
      const sandbox = $iframe.attr("sandbox");
      expect(sandbox).to.include("allow-scripts");
      expect(sandbox).to.include("allow-same-origin");
      expect(sandbox).to.include("allow-forms");
    });
  });

  it("should handle iframe resize events", () => {
    cy.log("Creating test page with resize controls");
    const testPage = createTestPage({
      resourceId: ORDERS_DASHBOARD_ID,
      apiKey,
      theme: CUSTOM_THEME,
      includeResizeControl: true,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Triggering container resize");
    cy.get("#resize-control").click();

    cy.log("Verifying iframe size adaptation");
    cy.get("iframe").should("have.css", "height", "500px");
  });
});

function createTestPage({
  resourceId,
  apiKey,
  theme,
  includeThemeControls = false,
  includeResizeControl = false,
}) {
  const controls = includeThemeControls
    ? `
    <input type="color" id="brand-color" onchange="updateBrandColor(event)">
    <script>
      function updateBrandColor(event) {
        const newTheme = {
          ...${JSON.stringify(theme)},
          colors: {
            ...${JSON.stringify(theme.colors)},
            brand: event.target.value,
          },
        };
        embed.updateSettings({ theme: newTheme });
      }
    </script>
    `
    : "";

  const resizeControl = includeResizeControl
    ? `
    <button id="resize-control" onclick="resizeContainer()">Resize</button>
    <script>
      function resizeContainer() {
        document.getElementById("metabase-embed-container").style.height = "500px";
      }
    </script>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Mono&display=swap" rel="stylesheet">
    </head>
    <body>
      <script src="http://localhost:3000/app/embed.v1.js"></script>

      <div id="metabase-embed-container"></div>
      ${controls}
      ${resizeControl}

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
          dashboardId: "${resourceId}",
          apiKey: "${apiKey}",
          theme: ${JSON.stringify(theme)},
        });
      </script>
    </body>
    </html>
  `;
}
