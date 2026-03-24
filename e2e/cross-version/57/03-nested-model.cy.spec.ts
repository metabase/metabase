import { Q2_JOINS_NAME, Q3_NESTED_NAME } from "../constants";
import { saveSimpleQuestion } from "../cross-version-helpers";

const { H } = cy;

describe("Cross-version questions - nested model", () => {
  it(
    "setup: creates a model based on another question",
    { tags: ["@source"] },
    () => {
      H.restoreCrossVersionDev("02-complete");
      cy.signIn("admin", { skipCache: true });

      cy.visit("/");

      cy.log("Create a model from a previous question");
      H.newButton("Question").click();
      H.modal().within(() => {
        cy.findAllByRole("tab")
          .should("be.visible")
          .filter(":contains(Collections)")
          .click();
      });
      cy.findAllByTestId("picker-item")
        .filter(`:contains(${Q2_JOINS_NAME})`)
        .click();
      H.addSummaryField({ metric: "Sum of ..." });
      H.popover().contains("Average of Discount").click();
      H.visualize();
      cy.findByTestId("scalar-value").should("have.text", "$20.80");
      saveSimpleQuestion(Q3_NESTED_NAME);
      H.modal().findByText("Not now").click();
      H.modal().should("not.exist");
      H.openQuestionActions();
      H.popover().findByText("Turn into a model").click();
      H.modal().button("Turn this into a model").click();
      cy.location("pathname").should("contain", "model");

      H.openQuestionActions();
      H.popover().findByText("Edit metadata").click();
      cy.location("pathname").should("include", "metadata");

      H.rightSidebar().within(() => {
        cy.findByDisplayValue("Sum of Average of Discount")
          .as("displayNameInput")
          .should("be.visible")
          .clear()
          .type("Total Discount")
          .blur();

        cy.findByRole("tab", { name: "Formatting" }).click();
        cy.findByDisplayValue("US Dollar").click();
      });
      H.popover().contains("Euro").click();
      H.rightSidebar().findByDisplayValue("Euro").should("be.visible");

      H.saveMetadataChanges();
      cy.location("pathname").should("not.include", "metadata");

      cy.findByTestId("scalar-value").should("have.text", "€20.80");
    },
  );

  it(
    "verify: model custom metadata is preserved",
    { tags: ["@target"] },
    () => {
      cy.signIn("admin", { skipCache: true });

      cy.visit("/collection/root");

      H.getPinnedSection()
        .findByRole("link")
        .should("contain", Q3_NESTED_NAME)
        .click();

      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 1 row",
      );
      cy.findByTestId("scalar-value").should("have.text", "€20.80");
      cy.findByLabelText("Switch to data").click();

      cy.findByTestId("scalar-value").should("not.exist");
      cy.findByTestId("header-cell").should("contain", "Total Discount (€)");

      H.snapshotCrossVersionDev("03-complete");
    },
  );
});
