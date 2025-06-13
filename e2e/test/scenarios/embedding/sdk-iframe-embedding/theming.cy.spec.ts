import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme/MetabaseTheme";

const { H } = cy;

const LIGHT_THEME = {
  colors: {
    brand: "rgb(156, 39, 176)",
    "text-primary": "rgb(45, 59, 69)",
    "text-secondary": "rgb(124, 136, 150)",
    "text-tertiary": "rgb(184, 187, 195)",
  },
} as const satisfies MetabaseTheme;

const DARK_THEME = {
  colors: {
    brand: "rgb(255, 87, 51)",
    "text-primary": "rgb(255, 255, 255)",
    "text-secondary": "rgb(200, 205, 210)",
    "text-tertiary": "rgb(184, 187, 195)",
    background: "rgb(39, 39, 59)",
    border: "rgb(184, 187, 195)",
  },
  components: {
    table: { cell: { backgroundColor: "rgb(39, 39, 59)" } },
  },
} as const satisfies MetabaseTheme;

describe("scenarios > embedding > sdk iframe embedding > theming", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("should apply custom themes", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      theme: DARK_THEME,
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    cy.wait("@getDashboard");

    frame.within(() => {
      cy.get(".mb-wrapper").should(
        "have.css",
        "background-color",
        DARK_THEME.colors.background,
      );

      cy.findByText("2000 rows").should(
        "have.css",
        "color",
        DARK_THEME.colors["text-primary"],
      );

      cy.findByText("Product ID").should(
        "have.css",
        "color",
        DARK_THEME.colors.brand,
      );
    });
  });

  it("should handle dynamic theme updates", () => {
    const THEME_SWITCHER_HTML = `
      <div>
        <button onclick="setLightTheme()" style="margin: 5px;">Light</button>
        <button onclick="setDarkTheme()" style="margin: 5px;">Dark</button>
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

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      theme: LIGHT_THEME,
      insertHtml: { beforeEmbed: THEME_SWITCHER_HTML },
    });

    cy.wait("@getDashboard");

    cy.log("1. verify colors in light theme");

    frame.within(() => {
      cy.findByText("Product ID").should(
        "have.css",
        "color",
        LIGHT_THEME.colors.brand,
      );

      cy.findByText("2000 rows").should(
        "have.css",
        "color",
        LIGHT_THEME.colors["text-primary"],
      );
    });

    cy.log("2. switch to dark theme and verify colors");

    cy.get("body").within(() => {
      cy.findByText("Dark").click();
    });

    frame.within(() => {
      cy.get(".mb-wrapper").should(
        "have.css",
        "background-color",
        DARK_THEME.colors.background,
      );

      cy.findByText("Product ID").should(
        "have.css",
        "color",
        DARK_THEME.colors.brand,
      );

      cy.findByText("2000 rows").should(
        "have.css",
        "color",
        DARK_THEME.colors["text-primary"],
      );
    });

    cy.log("3. switch to light theme and verify colors");

    cy.get("body").within(() => {
      cy.findByText("Light").click();
    });

    frame.within(() => {
      cy.findByText("Product ID").should(
        "have.css",
        "color",
        LIGHT_THEME.colors.brand,
      );

      cy.findByText("2000 rows").should(
        "have.css",
        "color",
        LIGHT_THEME.colors["text-primary"],
      );
    });
  });
});
