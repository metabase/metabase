import { StaticQuestion } from "@metabase/embedding-sdk-react";
import { version as reactVersion } from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

// In .github/workflows/embedding-sdk-component-tests.yml, we run tests
// across multiple React versions, including React 19.
const hostReactMajorVersion = parseInt(reactVersion, 10);

const REACT_18_WARNING =
  "This application uses React 18. The Metabase modular embedding SDK will require React 19 in a future release, and this embed will stop working once your Metabase instance is upgraded to it. Please upgrade your application to React 19.";

describe("scenarios > embedding-sdk > react-18-deprecation-warning", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.window().then((win) => {
      cy.spy(win.console, "warn").as("consoleWarn");
    });
  });

  (hostReactMajorVersion === 18 ? it : it.skip)(
    "warns about React 18 on localhost when the host app runs React 18",
    () => {
      mountSdkContent(<StaticQuestion questionId={ORDERS_QUESTION_ID} />);

      getSdkRoot().findByText("Product ID").should("exist");

      cy.findByTestId("sdk-usage-problem-indicator").click();

      cy.findByTestId("sdk-usage-problem-card").should(
        "contain.text",
        REACT_18_WARNING,
      );

      cy.get("@consoleWarn").should(
        "have.been.calledWithMatch",
        REACT_18_WARNING,
      );
    },
  );

  (hostReactMajorVersion > 18 ? it : it.skip)(
    "does not warn about React 18 when the host app runs a newer React",
    () => {
      mountSdkContent(<StaticQuestion questionId={ORDERS_QUESTION_ID} />);

      getSdkRoot().findByText("Product ID").should("exist");

      cy.findByTestId("sdk-usage-problem-indicator").should("not.exist");

      cy.get("@consoleWarn").should(
        "not.have.been.calledWithMatch",
        REACT_18_WARNING,
      );
    },
  );
});
