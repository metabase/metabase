import { Q4_SQL_NAME, SQL_QUERY } from "../constants";

import * as X from "./helpers";

const { H } = cy;

describe("Cross-version questions - sql", () => {
  it(
    "setup: creates a sql question with a snippet and a field filter variable",
    { tags: ["@source"] },
    () => {
      H.restoreCrossVersionDev("03-complete");
      cy.signIn("admin", { setupCache: true });

      cy.request("POST", "/api/native-query-snippet", {
        content: "REVIEWS.BODY IS NOT NULL",
        name: "Body Not Null",
      });

      cy.visit("/");
      H.newButton("SQL query").click();

      cy.log("-- Create a SQL question --");
      H.NativeEditor.type(SQL_QUERY, {
        focus: true,
        allowFastSet: true,
      }).blur();

      cy.log("-- Map the variable to a field filter --");
      cy.findByTestId("variable-type-select").click();
      X.selectFromPopover("Field Filter");
      H.popover().within(() => {
        cy.findByRole("heading", { name: "Sample Database" }).should(
          "be.visible",
        );
        cy.findByText("Reviews").click();
      });
      X.selectFromPopover("Rating");

      H.NativeEditor.clickOnRun();
      X.assertRowCount("1,112");

      cy.log("-- Hide the PK column --");
      cy.findByTestId("visualization-root")
        .findByTestId("table-header")
        .contains("PRODUCT_ID")
        .click();
      H.popover().icon("eye_crossed_out").click();

      cy.log("-- Assert on the preview values in a table --");
      cy.findByTestId("visualization-root").within(() => {
        cy.findByTestId("table-header")
          .should("contain", "REVIEWER")
          .and("contain", "RATING")
          .and("not.contain", "PRODUCT_ID");

        cy.findByTestId("table-body")
          .should("contain", "xavier")
          .and("contain", "4")
          .and("contain", "clement")
          .and("contain", "5");
      });

      cy.log("-- Assert that the filter is mapped to a correct value --");
      cy.findByTestId("parameter-widget").should("contain", "Rating");

      X.saveQuestion(Q4_SQL_NAME);
    },
  );

  it("verify: sql question can be filtered", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    cy.visit("/collection/root");

    cy.findAllByTestId("collection-entry-name")
      .filter(`:contains(${Q4_SQL_NAME})`)
      .click();

    cy.log("-- Assert that the columns are preserved --");
    X.assertRowCount("1,112");
    cy.findByTestId("visualization-root").within(() => {
      cy.findByTestId("table-header")
        .should("contain", "REVIEWER")
        .and("contain", "RATING")
        .and("not.contain", "PRODUCT_ID");

      cy.findByTestId("table-body")
        .should("contain", "xavier")
        .and("contain", "4")
        .and("contain", "clement")
        .and("contain", "5");
    });

    cy.log("-- Apply the filter --");
    cy.findByTestId("native-query-editor-container").within(() => {
      cy.findByText("This question is written in SQL.").should("be.visible");

      cy.findByTestId("parameter-widget").should("contain", "Rating").click();
    });
    H.popover().within(() => {
      cy.findByText("Perfecto").click();
      cy.findByText("Meh").click();

      cy.button("Add filter").click();
    });

    cy.findByTestId("qb-header").findByLabelText("Get Answer").click();

    cy.log("-- Assert that the filter values are correctly applied --");
    X.assertRowCount("442");
    cy.findByTestId("parameter-widget")
      .should("contain", "Rating")
      .and("contain", "2 selections");
    cy.findByTestId("table-body")
      .and("contain", "clement")
      .and("contain", "5")
      .should("contain", "clement")
      .and("contain", "3")
      .should("not.contain", "xavier")
      .and("not.contain", "4");
  });
});
