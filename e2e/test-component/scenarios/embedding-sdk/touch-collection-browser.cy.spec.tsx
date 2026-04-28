import { CollectionBrowser } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  disableTouchEmulation,
  enableTouchEmulation,
} from "e2e/support/helpers/e2e-mobile-device-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_DESCRIPTION = "This is a test description for the question";

describe("scenarios > embedding-sdk > touch collection browser", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "Question with description",
      description: QUESTION_DESCRIPTION,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
      collection_id: null,
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

    it("should show description tooltip on info icon tap without navigating to the item", () => {
      mountSdkContent(<CollectionBrowser collectionId="root" />);

      getSdkRoot().within(() => {
        cy.findByText("Question with description").should("be.visible");

        cy.findByText("Question with description")
          .closest("tr")
          .findByLabelText("info icon")
          .click();
      });

      cy.findByRole("tooltip").should("contain.text", QUESTION_DESCRIPTION);

      getSdkRoot().within(() => {
        cy.findByText("Question with description").should("be.visible");
      });
    });
  });
});
