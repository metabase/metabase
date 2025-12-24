const { H } = cy;
import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

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

    createQuestion({
      name: "Orders Question",
      query: {
        "source-table": ORDERS_ID,
        limit: 10,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("ordersQuestionId");
    });

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

  it("should stay in editor mode after adding a filter for the first time for an existing saved question (EMB-1077)", () => {
    cy.get<number>("@ordersQuestionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    getSdkRoot().within(() => {
      cy.findByTestId("notebook-button").click();

      cy.findByRole("button", { name: "Visualize" }).should("exist");

      cy.findAllByTestId("action-buttons").find(".Icon-filter").click();
    });

    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Previous 7 days").click();
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Visualize" }).should("exist");
    });
  });
});
