import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
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

      // Dispatch a native touchstart on the child popover.
      // Mantine's useClickOutside listens for touchstart on document —
      // since the Tippy portal is outside Mantine's DOM tree, this should
      // trigger the outside-click handler and close the parent popover.
      cy.findByTestId("series-settings").then(($el) => {
        const el = $el[0];
        const touch = new Touch({ identifier: 0, target: el });
        el.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [touch],
          }),
        );
      });

      // The child popover and parent dropdown should still be open
      cy.findByTestId("series-settings").should("exist");
    });
  });
});
