import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

describe("scenarios > data apps > custom visualizations", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    // Enabling custom viz requires CSP image loading on, then the feature toggle.
    H.updateSetting("csp-img-enabled", true);
    H.updateSetting("custom-viz-enabled", true);
    // Install the example plugin (identifier "demo-viz") straight through the API.
    H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
  });

  it("renders a custom visualization inside a data app", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: {
        ...TEST_ENV,
        // Opt the SDK into loading the custom viz inside the data app; without this
        // allowlist the SDK never surfaces or loads the plugin.
        allowedCustomVisualizations: [H.CUSTOM_VIZ_DISPLAY], // "custom:demo-viz"
      },
    });

    visitAppRoute("custom-viz");

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      // The InteractiveQuestion (a single-column count) must render before its
      // toolbar — `demo-viz` requires exactly one result column.
      cy.findByTestId("data-app-custom-viz", { timeout: 30000 }).should(
        "exist",
      );

      // Switch the visualization to the custom viz through the chart-type selector.
      cy.findByTestId("chart-type-selector-button", { timeout: 30000 }).click();
      cy.findByText("demo-viz").click();

      // The custom viz's own DOM proves it loaded + rendered inside the data app.
      cy.findByTestId("demo-viz-click-target", { timeout: 30000 }).should(
        "be.visible",
      );
    });
  });
});
