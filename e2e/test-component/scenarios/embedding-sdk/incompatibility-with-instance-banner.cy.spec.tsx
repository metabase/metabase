import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { DEFAULT_SDK_AUTH_PROVIDER_CONFIG } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > incompatibility-with-instance-banner", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  describe("when the SDK is incompatible with an instance", () => {
    it("should show an error with a close button", () => {
      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        cy.intercept("POST", "*", (req) => {
          req.reply({
            statusCode: 500,
            headers: {
              "X-Metabase-Version": "v0.0.0", // incompatible version
            },
            body: req.body,
          });
        });

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
          authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
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

        cy.intercept("POST", "*", (req) => {
          req.reply({
            statusCode: 500,
            headers: {
              "X-Metabase-Version": "v0.0.0", // incompatible version
            },
            body: req.body,
          });
        });

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
