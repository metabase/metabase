import { Q2_NAME, Q3_NAME } from "../constants";

import * as X from "./helpers";

const { H } = cy;

describe("Cross-version questions - nested model", () => {
  it(
    "setup: creates a model based on another question",
    { tags: ["@source"] },
    () => {
      cy.signIn("admin", { skipCache: true });

      cy.log("-- Create a model from a previous question --");

      cy.visit("/");
      H.newButton("Question").click();

      X.selectFromPopover("Our analytics");
      X.selectFromPopover(Q2_NAME);

      cy.log("-- Add aggregation --");
      H.addSummaryField({ metric: "Sum of ..." });
      X.selectFromPopover("Average of Discount");

      H.visualize();
      cy.findByTestId("scalar-value").should("have.text", "$20.80");

      X.saveQuestion(Q3_NAME);

      cy.log("-- Turn question into a model --");
      H.openQuestionActions();
      X.selectFromPopover("Turn into a model");
      // Doesn't use modal() helper from e2e-ui-elements-helpers.js because the modal change significantly between v60 -> v63.
      cy.findByRole("dialog").button("Turn this into a model").click();
      cy.location("pathname").should("contain", "model");

      cy.log("-- Edit model metadata --");
      H.openQuestionActions();
      X.selectFromPopover("Edit metadata");
      H.waitForLoaderToBeRemoved();
      cy.location("pathname").should("include", "columns");

      H.renameColumn("Sum of Average of Discount", "Total Discount");

      H.rightSidebar().findByDisplayValue("US Dollar").click();
      X.selectFromPopover("Euro");
      H.rightSidebar().findByDisplayValue("Euro").should("be.visible");

      H.saveMetadataChanges();

      // Reload to ensure a scalar is displayed, not a table.
      cy.intercept("GET", "/api/card/*/query_metadata").as("modelQuery");
      cy.reload();
      cy.wait("@modelQuery");
      cy.findByTestId("scalar-value").should("have.text", "€20.80");

      cy.log("-- Pin the model so the verify step can find it --");
      // `@saveQuestion` is the POST /api/card intercept that X.saveQuestion sets up;
      // it is the only POST /api/card in this test, so it still holds cv3's creation.
      cy.get<{ response: { body: { id: number } } }>("@saveQuestion").then(
        ({ response }) => X.pinQuestion(response.body.id),
      );
    },
  );

  it(
    "verify: model custom metadata is preserved",
    { tags: ["@target"] },
    () => {
      cy.signIn("admin", { skipCache: true });

      X.visitRootCollectionAndWait();

      H.getPinnedSection()
        .findByRole("link")
        .should("contain", Q3_NAME)
        .click();

      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 1 row",
      );

      cy.log("-- Assert that the model metadata is preserved --");
      cy.findByTestId("scalar-value").should("have.text", "€20.80");
      cy.findByLabelText("Switch to data").click();

      cy.findByTestId("scalar-value").should("not.exist");
      cy.findByTestId("header-cell").should("contain", "Total Discount (€)");
    },
  );
});
