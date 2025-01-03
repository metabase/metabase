import { createQuestion, describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

import { mountStaticQuestion } from "e2e/support/helpers/component-testing-sdk/component-embedding-sdk-static-question-helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("scenarios > embedding-sdk > static-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion(
      {
        name: "my-static-question",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
      },
      { wrapId: true },
    );

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show the question's table visualization", () => {
    mountStaticQuestion();

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Max of Quantity").should("be.visible");
    });
  });

  it("is able to change visualization types", () => {
    mountStaticQuestion({ withChartTypeSelector: true });

    getSdkRoot().within(() => {
      cy.findByTestId("chart-container").should("not.exist");
      cy.findByTestId("Bar-button").click();
      cy.findByTestId("chart-container").should("be.visible");
    });
  });
});
