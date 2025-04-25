import {
  ALL_USERS_GROUP_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type ThemeEmbedTestPageOptions,
  getBaseSdkIframeEmbedHtml,
  loadSdkEmbedIframeTestPage,
} from "e2e/support/helpers/e2e-embedding-iframe-sdk-helpers";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

const CUSTOM_THEME: MetabaseTheme = {
  colors: {
    brand: "#FF5733",
    "text-primary": "#2C3E50",
    "text-secondary": "#95A5A6",
    "text-tertiary": "#BDC3C7",
    background: "#ECF0F1",
  },
};

describe("scenarios > embedding > sdk iframe embedding > themes and browser", () => {
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

  it("should apply custom theme with fonts and colors", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = loadSdkEmbedIframeTestPage(
        {
          resourceId: ORDERS_DASHBOARD_ID,
          apiKey,
          theme: CUSTOM_THEME,
        },
        getThemeTestPageHtml,
      );

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
      const frame = loadSdkEmbedIframeTestPage(
        {
          resourceId: ORDERS_DASHBOARD_ID,
          apiKey,
          theme: CUSTOM_THEME,
          includeThemeControls: true,
        },
        getThemeTestPageHtml,
      );

      cy.get("#brand-color").invoke("val", "#00FF00").trigger("change");

      frame
        .find("[data-testid='brand-element']")
        .should("have.css", "color", "rgb(0, 255, 0)");
    });
  });

  it("should verify iframe sandbox attributes", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      loadSdkEmbedIframeTestPage(
        {
          resourceId: ORDERS_DASHBOARD_ID,
          apiKey,
          theme: CUSTOM_THEME,
        },
        getThemeTestPageHtml,
      );

      cy.get("iframe").should(($iframe) => {
        const sandbox = $iframe.attr("sandbox");
        expect(sandbox).to.include("allow-scripts");
        expect(sandbox).to.include("allow-same-origin");
        expect(sandbox).to.include("allow-forms");
      });
    });
  });
});

function getThemeTestPageHtml(options: ThemeEmbedTestPageOptions): string {
  const controls = options.includeThemeControls
    ? `
    <input type="color" id="brand-color" onchange="updateBrandColor(event)">
    <script>
      function updateBrandColor(event) {
        const newTheme = {
          ...${JSON.stringify(options.theme)},
          colors: {
            ...${JSON.stringify(options.theme.colors)},
            brand: event.target.value,
          },
        };
        embed.updateSettings({ theme: newTheme });
      }
    </script>
    `
    : "";

  const additionalHead =
    '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Mono&display=swap" rel="stylesheet">';

  return getBaseSdkIframeEmbedHtml(
    options,
    {
      dashboardId: options.resourceId,
      theme: options.theme,
    },
    additionalHead,
    controls,
  );
}
