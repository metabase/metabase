import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > notebook touch support", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "Notebook touch test",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  describe("touch device", () => {
    beforeEach(() => {
      cy.viewport("iphone-x");
      enableTouchEmulation();
    });

    afterEach(() => {
      disableTouchEmulation();
    });

    it("remove step button should be visible without hover (EMB-1457)", () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />);
      });

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        // The "Summarize" step should have a visible remove button
        // without needing to hover first
        cy.findByLabelText("Remove step").should("be.visible");
      });
    });

    it("notebook step buttons should respond to first tap (EMB-1457)", () => {
      cy.get<number>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />);
      });

      getSdkRoot().within(() => {
        cy.findByTestId("notebook-button").click();

        // The question has a Summarize step. Clicking the existing
        // aggregation pill should open the popover on the first tap
        // without requiring a second tap.
        cy.findByTestId("step-summarize-0-0").findByText("Count").click();

        cy.findByTestId("clause-popover").should("be.visible");
      });
    });
  });
});
