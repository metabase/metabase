import { StaticQuestion } from "@metabase/embedding-sdk-react";
import * as React from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const UNSUPPORTED_REACT_ERROR =
  "The Metabase modular embedding SDK requires React 18 or newer, but this application is running React 17. Upgrade your application to React 18 to display embedded content.";

describe("scenarios > embedding-sdk > unsupported-react-version", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.window().then((win) => {
      cy.spy(win.console, "error").as("consoleError");

      // The SDK bundle reads the host's React from this global when it loads,
      // so it sees React 17 while the test itself keeps rendering with the
      // real one.
      Object.assign(win, {
        METABASE_REACT: { ...React, version: "17.0.2" },
      });
    });
  });

  it("shows an error in place of the SDK and keeps the host app rendering", () => {
    mountSdkContent(
      <>
        <div data-testid="host-app-content">host app content</div>
        <StaticQuestion questionId={ORDERS_QUESTION_ID} />
      </>,
      // The unsupported React check skips auth, so no user is requested.
      { waitForUser: false },
    );

    cy.findByTestId("sdk-unsupported-react-version-error").should(
      "have.text",
      UNSUPPORTED_REACT_ERROR,
    );
    cy.findByTestId("host-app-content").should("be.visible");
    cy.get("[data-cy-root]").findByText("Product ID").should("not.exist");

    cy.get<sinon.SinonSpy>("@consoleError").should((consoleError) => {
      const unsupportedReactErrors = consoleError.args.filter(
        ([message]) => message === UNSUPPORTED_REACT_ERROR,
      );

      expect(unsupportedReactErrors).to.have.length(1);
    });
  });
});
