import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

import { createKitchenSinkDataApp } from "./helpers";

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
    createKitchenSinkDataApp();

    visitAppRoute("custom-viz");

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
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
