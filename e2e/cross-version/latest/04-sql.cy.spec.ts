import { Q4_SQL_NAME } from "../constants";

describe("Cross-version: questions", () => {
  it.skip("setup: creates a pivot table", { tags: ["@source"] }, () => {
    cy.request("POST", "/api/native-query-snippet", {
      content: "REVIEWS.BODY IS NOT NULL",
      name: "Body Not Null",
    });

    H.newButton("SQL query").click();
    H.NativeEditor.type(
      `
      SELECT PRODUCT_ID, REVIEWER, RATING
      FROM REVIEWS
      WHERE {{snippet: Body Not Null}}
      AND {{rating}}`,
      { focus: true, allowFastSet: true },
    ).blur();
    cy.findByTestId("variable-type-select").click();
    H.popover().contains("Field Filter").click();
    H.popover().within(() => {
      cy.findByRole("heading", { name: "Sample Database" }).should(
        "be.visible",
      );
      cy.findByText("Reviews").click();
    });
    H.popover().contains("Rating").click();
    H.NativeEditor.clickOnRun();
    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 1,112 rows",
    );
    H.saveQuestion(Q4_SQL_NAME);
  });

  it(
    "verify: questions and their visualizations display correctly",
    { tags: ["@target"] },
    () => {},
  );
});
