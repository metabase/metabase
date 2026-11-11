const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 40064", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to edit a custom column with the same name as one of the columns used in the expression (metabase#40064)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Tax: ["*", ["field", ORDERS.TAX, { "base-type": "type/Float" }], 2],
          },
          limit: 1,
        },
      },
      { visitQuestion: true },
    );

    cy.log("check the initial expression value");
    H.tableInteractive().findByText("4.14").should("be.visible");

    cy.log("update the expression and check the value");
    H.openNotebook();
    H.getNotebookStep("expression").findByText("Tax").click();
    H.enterCustomColumnDetails({ formula: "[Tax] * 3", blur: true });
    H.popover().button("Update").click();
    H.visualize();
    H.tableInteractive().findByText("6.21").should("be.visible");

    cy.log("rename the expression and make sure you cannot create a cycle");
    H.openNotebook();
    H.getNotebookStep("expression").findByText("Tax").click();
    H.enterCustomColumnDetails({
      formula: "[Tax] * 3",
      name: "Tax3",
      blur: true,
    });
    H.popover().button("Update").should("not.be.disabled").click();
    H.getNotebookStep("expression").findByText("Tax3").click();
    H.enterCustomColumnDetails({
      formula: "[Tax3] * 3",
      name: "Tax3",
      blur: true,
    });
    H.popover().within(() => {
      cy.findByText("Unknown column: Tax3").should("be.visible");
      cy.button("Update").should("be.disabled");
    });
  });
});
