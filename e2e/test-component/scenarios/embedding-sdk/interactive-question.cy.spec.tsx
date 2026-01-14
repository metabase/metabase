const { H } = cy;
import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createNativeQuestion(
      {
        name: "SQL Orders",
        native: { query: "select * from ORDERS limit 5" },
      },
      {
        wrapId: true,
        idAlias: "sqlQuestionId",
      },
    );
    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should be able to drill SQL question (EMB-273)", () => {
    cy.get("@sqlQuestionId").then((sqlQuestionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={sqlQuestionId} withParameters />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("SQL Orders").should("be.visible");
      H.assertTableRowsCount(5);

      // Drill down to "See these Orders"
      cy.get("[data-dataset-index=0] > [data-column-id='PRODUCT_ID']")
        .should("have.text", "14")
        .click();
      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.button(">").click();
      });
      H.assertTableRowsCount(4);
    });
  });

  it.skip("should be able to edit a native question with the QueryEditor", () => {
    cy.get("@sqlQuestionId").then((sqlQuestionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={sqlQuestionId} withParameters />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("SQL Orders").should("be.visible");
      H.assertTableRowsCount(5);

      cy.findByTestId("notebook-button").click();
      cy.findByTestId("native-query-editor").should("be.visible");

      cy.realPress(["Meta", "ArrowRight"]);
      cy.realPress("Backspace");
      cy.realType("10");

      cy.realPress(["Meta", "Enter"]);

      cy.button("Visualize").click();

      H.assertTableRowsCount(10);
    });
  });

  it("should be able to create a native question with the QueryEditor", () => {
    mountSdkContent(
      <InteractiveQuestion questionId="new-native" withParameters />,
    );

    getSdkRoot().within(() => {
      cy.findByTestId("native-query-editor").should("be.visible");

      cy.wait(1000);

      cy.realType("SELECT * from ORDERS LIMIT 10");

      cy.wait(1000);
      cy.realPress(["Meta", "Enter"]);
      cy.wait(1000);

      cy.button("Visualize").click();

      H.assertTableRowsCount(10);
    });
  });
});
