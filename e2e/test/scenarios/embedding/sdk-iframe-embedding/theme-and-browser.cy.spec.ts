import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

const { H } = cy;

const LIGHT_THEME: MetabaseTheme = {
  colors: {
    brand: "#9C27B0",
    "text-primary": "#2D3B45",
    "text-secondary": "#7C8896",
    "text-tertiary": "#B8BBC3",
  },
};

const DARK_THEME: MetabaseTheme = {
  colors: {
    brand: "#FF5733",
    "text-primary": "#ffffff",
    "text-secondary": "#B8BBC3",
    "text-tertiary": "#7C8896",
    background: "#ECF0F1",
  },
};

describe("scenarios > embedding > sdk iframe embedding > themes and browser", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
  });

  it("should apply custom theme with fonts and colors", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        resourceId: ORDERS_DASHBOARD_ID,
        apiKey,
        theme: DARK_THEME,
      });

      frame
        .should("have.css", "background-color", "rgb(236, 240, 241)")
        .and("have.css", "font-family", "'Roboto', sans-serif");

      frame
        .find("[data-testid='dashboard-name']")
        .should("have.css", "color", "rgb(44, 62, 80)");
    });
  });

  it("should handle dynamic theme updates", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      H.loadSdkIframeEmbedTestPage({
        resourceId: ORDERS_DASHBOARD_ID,
        apiKey,
        theme: LIGHT_THEME,
        includeThemeControls: true,
      });
    });
  });

  it("should verify iframe sandbox attributes", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      H.loadSdkIframeEmbedTestPage({
        apiKey,
        theme: LIGHT_THEME,
        resourceId: ORDERS_DASHBOARD_ID,
      });

      cy.get("iframe").should(($iframe) => {
        const sandbox = $iframe.attr("sandbox");
        expect(sandbox).to.include("allow-scripts");
        expect(sandbox).to.include("allow-same-origin");
        expect(sandbox).to.include("allow-forms");
      });
    });
  });
});

export function getAdditionalHtml({
  includeThemeControls = false,
}: {
  includeThemeControls?: boolean;
}) {
  if (!includeThemeControls) {
    return null;
  }

  return `
    <div>
      <button onclick="setLightTheme" style="margin: 5px;">Light Theme</button>
      <button onclick="setDarkTheme" style="margin: 5px;">Dark Theme</button>
    </div>

    <script>
      const LIGHT_THEME = ${JSON.stringify(LIGHT_THEME)};
      const DARK_THEME = ${JSON.stringify(DARK_THEME)};

      function setLightTheme() {
        embed.updateSettings({ theme: LIGHT_THEME });
      }

      function setDarkTheme() {
        embed.updateSettings({ theme: DARK_THEME });
      }
    </script>
  `;
}
