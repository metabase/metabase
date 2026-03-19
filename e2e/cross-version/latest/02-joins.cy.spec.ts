import { Q2_JOINS_NAME } from "../constants";

const { H } = cy;

describe("Cross-version: questions", () => {
  it.skip("setup: creates a joined question", { tags: ["@source"] }, () => {
    H.restore("setup");
    cy.signIn("admin", { skipCache: true });

    cy.visit("/");

    cy.log("Create a joined question");
    H.newButton("Question").click();
    H.popover().contains("Sample Database").click();
    H.popover().contains("Orders").click();

    H.join();
    H.popover().contains("Sample Database").click();
    H.popover().contains("Products").click();

    cy.log("Filter on the joined table");
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().within(() => {
      cy.findByRole("heading", { name: "Products" }).click();
      cy.findByLabelText("Price").click();
    });

    H.popover().within(() => {
      cy.findByLabelText("Filter operator").should("have.text", "Between");
      cy.findByPlaceholderText("Min").type("0");
      cy.findByPlaceholderText("Min").type("50").blur();
      cy.button("Add filter").click();
    });

    cy.log("Add aggregation");
    H.addSummaryField({ metric: "Average of ..." });
    H.popover().contains("Discount").click();
    cy.log("Add breakouts");
    H.addSummaryGroupingField({ table: "Products", field: "Category" });
    cy.findByLabelText("Sort").click();
    H.popover().contains("Average of Discount").click();

    H.visualize();
    cy.findByTestId("question-row-count").should("have.text", "Showing 4 rows");

    H.saveQuestion(Q2_JOINS_NAME);
  });

  it(
    "verify: questions and their visualizations display correctly",
    { tags: ["@target"] },
    () => {
      cy.signIn("admin", { skipCache: true });

      cy.visit("/collection/root");
      cy.findAllByTestId("collection-entry-name")
        .filter(`:contains(${Q2_JOINS_NAME})`)
        .click();

      cy.log("Assert that there are four bars");
      H.chartPathWithFillColor("#A989C5").should("have.length", 4);
      // todo
      // assert on labels IF possible
    },
  );
});
