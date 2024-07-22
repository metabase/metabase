import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  tableInteractive,
  visualize,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 40064", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to edit a custom column with the same name as one of the columns used in the expression (metabase#40064)", () => {
    createQuestion(
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
    tableInteractive().findByText("4.14").should("be.visible");

    cy.log("update the expression and check the value");
    openNotebook();
    getNotebookStep("expression").findByText("Tax").click();
    enterCustomColumnDetails({ formula: "[Tax] * 3" });
    popover().button("Update").click();
    visualize();
    tableInteractive().findByText("6.21").should("be.visible");

    cy.log("rename the expression and make sure you cannot create a cycle");
    openNotebook();
    getNotebookStep("expression").findByText("Tax").click();
    enterCustomColumnDetails({ formula: "[Tax] * 3", name: "Tax3" });
    popover().button("Update").click();
    getNotebookStep("expression").findByText("Tax3").click();
    enterCustomColumnDetails({ formula: "[Tax3] * 3", name: "Tax3" });
    popover().within(() => {
      cy.findByText("Cycle detected: Tax3 → Tax3").should("be.visible");
      cy.button("Update").should("be.disabled");
    });
  });
});
