import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > touch join column picker", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  describe("touch device", () => {
    beforeEach(() => {
      cy.viewport("iphone-x", "landscape");
      enableTouchEmulation();
    });

    afterEach(() => {
      disableTouchEmulation();
    });

    it("should show bucket picker button text on touch devices", () => {
      mountSdkContent(
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion questionId="new" />
        </div>,
      );

      // Pick Orders table
      popover().within(() => {
        cy.findByText("Orders").click();
      });

      // Add join
      getSdkRoot().within(() => {
        cy.button("Join data").click();
      });

      // Pick Products table
      popover().within(() => {
        cy.findByText("Products").click();
      });

      // Open left column picker and find a date column with temporal bucket
      cy.findByLabelText("Left column").click();
      popover().within(() => {
        // Scroll to the bucket picker item to ensure it's in view
        cy.findByTestId("dimension-list-item-binning").scrollIntoView();

        // The "by month" bucket button should be visible on touch devices
        cy.findByTestId("dimension-list-item-binning").should("be.visible");
        cy.findByTestId("dimension-list-item-binning").should(
          "not.have.css",
          "visibility",
          "hidden",
        );
      });
    });

    it("should not autofocus search field in column picker on touch devices", () => {
      mountSdkContent(
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion questionId="new" />
        </div>,
      );

      // Pick Orders table
      popover().within(() => {
        cy.findByText("Orders").click();
      });

      // Add join
      getSdkRoot().within(() => {
        cy.button("Join data").click();
      });

      // Pick Products table
      popover().within(() => {
        cy.findByText("Products").click();
      });

      // Open left column picker
      cy.findByLabelText("Left column").click();

      // Search field should exist but not be focused on touch devices
      popover().within(() => {
        cy.findByTestId("list-search-field").should("exist");
        cy.findByTestId("list-search-field").should("not.be.focused");
      });
    });
  });
});
