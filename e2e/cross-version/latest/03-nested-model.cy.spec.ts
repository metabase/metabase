import { Q2_JOINS_NAME, Q3_NESTED_NAME } from "../constants";

describe("Cross-version: questions", () => {
  it.skip("setup: creates a pivot table", { tags: ["@source"] }, () => {
    H.newButton("Question").click();
    H.popover().contains("Our analytics").click();
    H.popover().contains(Q2_JOINS_NAME).click();
    H.addSummaryField({ metric: "Sum of ..." });
    H.popover().contains("Average of Discount").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "$20.80");
    H.saveQuestion(Q3_NESTED_NAME);
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().button("Turn this into a model").click();
    cy.location("pathname").should("contain", "model");
  });

  it(
    "verify: questions and their visualizations display correctly",
    { tags: ["@target"] },
    () => {},
  );
});
