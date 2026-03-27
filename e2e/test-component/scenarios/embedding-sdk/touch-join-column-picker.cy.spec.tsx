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

    it("should not scroll parent dropdown when swiping on nested bucket picker", () => {
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

      // Click the temporal bucket button (e.g. "by month")
      popover()
        .findByTestId("dimension-list-item-binning")
        .click({ force: true });

      // Expand all temporal options
      popover().last().findByText("More…").click();

      // Swipe on the nested dropdown via CDP touch events
      popover()
        .last()
        .then(($nested) => {
          const rect = $nested[0].getBoundingClientRect();
          const x = Math.round(rect.left + rect.width / 2);
          const startY = Math.round(rect.top + rect.height / 2);
          const endY = startY - 100;

          cy.then(() =>
            Cypress.automation("remote:debugger:protocol", {
              command: "Input.dispatchTouchEvent",
              params: {
                type: "touchStart",
                touchPoints: [{ x, y: startY }],
              },
            }),
          );
          cy.then(() =>
            Cypress.automation("remote:debugger:protocol", {
              command: "Input.dispatchTouchEvent",
              params: {
                type: "touchMove",
                touchPoints: [{ x, y: endY }],
              },
            }),
          );
          cy.then(() =>
            Cypress.automation("remote:debugger:protocol", {
              command: "Input.dispatchTouchEvent",
              params: {
                type: "touchEnd",
                touchPoints: [],
              },
            }),
          );
        });

      // Parent column picker should still show the same first item
      // (if it scrolled, the visible items would shift)
      popover().first().findByText("Product ID").should("be.visible");

      // Nested dropdown should still be open
      popover().last().findByText("Week").should("be.visible");
    });
  });
});
