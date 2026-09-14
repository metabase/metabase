import { StaticQuestion } from "@metabase/embedding-sdk-react";
import { version as reactVersion } from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

// In .github/workflows/embedding-sdk-component-tests.yml, we run tests
// across multiple React versions, including React 19.
const isHostReact18 = reactVersion.startsWith("18.");

describe("scenarios > embedding-sdk > react-18-deprecation-warning", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("warns about React 18 on localhost only when the host app runs React 18", () => {
    mountSdkContent(<StaticQuestion questionId={ORDERS_QUESTION_ID} />);

    getSdkRoot().findByText("Product ID").should("exist");

    if (isHostReact18) {
      cy.findByTestId("sdk-usage-problem-indicator").click();

      cy.findByTestId("sdk-usage-problem-card").should(
        "contain.text",
        "This embed is running on React 18. The SDK will require React 19 in an upcoming release. Please upgrade your application to React 19 to keep receiving updates.",
      );
    } else {
      cy.findByTestId("sdk-usage-problem-indicator").should("not.exist");
    }
  });
});
