import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { getDefaultSdkAuthProviderConfig } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const mockIncompatibleMetabaseVersion = () => {
  cy.intercept("POST", "*", (req) => {
    req.reply({
      statusCode: 500,
      headers: {
        "X-Metabase-Version": "v0.0.0", // incompatible version
      },
      body: req.body,
    });
  });
};

describe.skip("scenarios > embedding-sdk > incompatibility-with-instance-banner", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  describe("when the SDK bundle is incompatible with an instance", () => {
    it("should show an error with a close button", () => {
      cy.mount(
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        mockIncompatibleMetabaseVersion();

        cy.findByText("Visualize").click();
      });

      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "The analytics server is undergoing maintenance",
      );

      cy.findByTestId("sdk-error-container").within(() => {
        cy.findByTestId("alert-close-button").click();

        cy.findByTestId("sdk-error-container").should("not.exist");
      });
    });

    it("should show an error after the SDK is re-mounted", () => {
      cy.mount(
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        // We wait for the text to ensure that the SDK is initialized
        cy.findByText("Orders").should("exist");
      });

      // Unmount the SDK
      cy.mount(<></>);

      // Remount the SDK, the `api.onResponseError` handler that was set previously should properly work with the new reduxStore
      cy.mount(
        <MetabaseProvider authConfig={getDefaultSdkAuthProviderConfig()}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        mockIncompatibleMetabaseVersion();

        cy.findByText("Visualize").click();
      });

      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "The analytics server is undergoing maintenance",
      );

      cy.findByTestId("sdk-error-container").within(() => {
        cy.findByTestId("alert-close-button").click();

        cy.findByTestId("sdk-error-container").should("not.exist");
      });
    });

    it("should show a custom error with a close button", () => {
      cy.mount(
        <MetabaseProvider
          authConfig={getDefaultSdkAuthProviderConfig()}
          errorComponent={({
            message,
            onClose,
          }: {
            message: string;
            onClose: () => void;
          }) => (
            <div>
              <span>Custom error: {message}</span>
              <div data-testid="custom-alert-close-icon" onClick={onClose}>
                x
              </div>
            </div>
          )}
        >
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        mockIncompatibleMetabaseVersion();

        cy.findByText("Visualize").click();
      });

      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "The analytics server is undergoing maintenance",
      );

      cy.findByTestId("sdk-error-container").within(() => {
        cy.findByTestId("custom-alert-close-icon").click();

        cy.findByTestId("sdk-error-container").should("not.exist");
      });
    });
  });
});
