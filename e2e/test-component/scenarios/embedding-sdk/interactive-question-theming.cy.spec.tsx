import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Box } from "metabase/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > interactive-question > theming", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should apply theme values to interactive question's default layout", () => {
    cy.get<number>("@questionId").then(questionId => {
      mountSdkContent(
        <Box bg="#161A1D">
          <InteractiveQuestion questionId={questionId} />
        </Box>,
        { theme: {} },
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      // cy.findByTestId(testId).should(
      //   "have.css",
      //   "background-color",
      //   backgroundColor,
      // );

      // cy.findByTestId("notebook-button").click();

      // TODO: check based on the lighten/darken values
      // cy.get("[aria-label='Custom column']").should(
      //   "have.css",
      //   "background-color",
      //   questionTheme.editor.secondaryActionButton.backgroundColor,
      // );
    });
  });
});
