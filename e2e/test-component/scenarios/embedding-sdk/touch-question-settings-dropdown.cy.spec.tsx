import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
  fireTouchStart,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > touch-question-settings-dropdown", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.viewport("iphone-x");
    enableTouchEmulation();
  });

  afterEach(() => {
    disableTouchEmulation();
  });

  it("should not close the settings dropdown when tapping inside a child popover", () => {
    mountSdkContent(
      <InteractiveQuestion questionId={ORDERS_BY_YEAR_QUESTION_ID} />,
    );

    H.openVizSettingsSidebar();

    getSdkRoot().within(() => {
      cy.findByTestId("settings-count").click();

      // Tap inside the child popover — should NOT close the parent dropdown
      fireTouchStart("series-settings");
      cy.findByTestId("series-settings").should("exist");
      cy.findByTestId("chartsettings-sidebar").should("be.visible");

      // Click inside the parent dropdown — should close the child popover
      cy.findByTestId("chartsettings-sidebar").realTouch({ x: 1, y: 1 });
      cy.findByTestId("series-settings").should("not.exist");
    });
  });
});
