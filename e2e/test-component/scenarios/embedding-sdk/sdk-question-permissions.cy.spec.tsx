import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > sdk-question query builder editing controls permissions (EMB-1963)", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  it("hides Filter, Summarize, and the notebook editor toggle when the user lacks create-queries permission on the underlying table", () => {
    // `readonly` has create-queries: no
    cy.signOut();
    mockAuthProviderAndJwtSignIn(USERS.readonly);

    mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

    getSdkRoot().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");

      cy.button("Filter").should("not.exist");
      cy.button("Summarize").should("not.exist");
      cy.findByTestId("notebook-button").should("not.exist");
    });
  });

  it("shows Filter, Summarize, and the notebook editor toggle when the user has create-queries permission on the underlying table", () => {
    // `readonlynosql` has create-queries: query-builder
    cy.signOut();
    mockAuthProviderAndJwtSignIn(USERS.readonlynosql);

    mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

    getSdkRoot().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");

      cy.button("Filter").should("be.visible");
      cy.button("Summarize").should("be.visible");
      cy.findByTestId("notebook-button").should("be.visible");
    });
  });
});
