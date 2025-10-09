import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  getSdkBundleScriptElement,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

const { H } = cy;

const sdkBundleCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  delete window.METABASE_EMBEDDING_SDK_BUNDLE;
  delete window.METABASE_PROVIDER_PROPS_STORE;
  deleteConflictingCljsGlobals();
};

describe(
  "scenarios > embedding-sdk > sdk-bundle-error-handling",
  {
    tags: ["@skip-backward-compatibility"],
    // These test in some cases load a new SDK Bundle that in combination with the Component Testing is memory-consuming
    numTestsKeptInMemory: 1,
  },
  () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      cy.signOut();

      mockAuthProviderAndJwtSignIn();
    });

    beforeEach(() => {
      H.clearBrowserCache();

      sdkBundleCleanup();

      cy.intercept("GET", "**/app/embedding-sdk.js", {
        statusCode: 404,
      });
    });

    describe("when the SDK bundle can't be loaded", () => {
      it("should show an error", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            waitForUser: false,
          },
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedded Analytics SDK",
        );
      });

      it("should show a custom error", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              errorComponent: ({ message }: { message: string }) => (
                <div>Custom error: {message}</div>
              ),
            },
            waitForUser: false,
          },
        );

        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Custom error: Error loading the Embedded Analytics SDK",
        );
      });
    });
  },
);
