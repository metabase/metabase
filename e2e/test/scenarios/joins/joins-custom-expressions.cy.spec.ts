import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

type TestCase = {
  operator: string;
  lhsExpression: string;
  rhsExpression: string;
  expectedRowCount: number;
};

const TEST_CASES: TestCase[] = [
  {
    operator: "=",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1112,
  },
  {
    operator: "=",
    lhsExpression: "false",
    rhsExpression: "false",
    expectedRowCount: 1112,
  },
  {
    operator: "=",
    lhsExpression: '"A"',
    rhsExpression: '"A"',
    expectedRowCount: 1112,
  },
  {
    operator: "!=",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1,
  },
  {
    operator: "!=",
    lhsExpression: "false",
    rhsExpression: "false",
    expectedRowCount: 1,
  },
  {
    operator: "!=",
    lhsExpression: '"A"',
    rhsExpression: '"A"',
    expectedRowCount: 1,
  },
  {
    operator: ">",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1,
  },
  {
    operator: ">=",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1112,
  },
  {
    operator: "<",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1,
  },
  {
    operator: "<=",
    lhsExpression: "1",
    rhsExpression: "1",
    expectedRowCount: 1112,
  },
  {
    operator: ">",
    lhsExpression: "[ID] + 1",
    rhsExpression: "[ID] - 1",
    expectedRowCount: 2,
  },
  {
    operator: ">=",
    lhsExpression: "[ID] + 1",
    rhsExpression: "[ID] - 1",
    expectedRowCount: 3,
  },
  {
    operator: "<",
    lhsExpression: "[ID] + [User ID]",
    rhsExpression: "[ID] - [Product ID]",
    expectedRowCount: 1109,
  },
  {
    operator: "<=",
    lhsExpression: "[ID] + [User ID]",
    rhsExpression: "[ID] - [Product ID]",
    expectedRowCount: 1110,
  },
  {
    operator: "=",
    lhsExpression: "year([Created At])",
    rhsExpression: "year([Created At])",
    expectedRowCount: 452,
  },
];

describe("scenarios > joins > custom expressions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("should support expressions in join conditions", () => {
    TEST_CASES.forEach(
      ({ operator, lhsExpression, rhsExpression, expectedRowCount }) => {
        it(`${lhsExpression} ${operator} ${rhsExpression}`, () => {
          H.openOrdersTable({ mode: "notebook" });

          H.join();
          H.miniPicker().within(() => {
            cy.findByText("Sample Database").click();
            cy.findByText("Reviews").click();
          });
          H.popover().within(() => {
            cy.findByText("Custom Expression").click();
            H.enterCustomColumnDetails({ formula: lhsExpression });
            cy.button("Done").click();
          });
          H.popover().within(() => {
            cy.findByText("Custom Expression").click();
            H.enterCustomColumnDetails({ formula: rhsExpression });
            cy.button("Done").click();
          });
          H.getNotebookStep("join").findByLabelText("Change operator").click();
          H.popover().findByText(operator).click();

          H.filter({ mode: "notebook" });
          H.popover().within(() => {
            cy.findByText("ID").click();
            cy.findByPlaceholderText("Enter an ID").type("1");
            cy.button("Add filter").click();
          });

          H.visualize();
          H.assertQueryBuilderRowCount(expectedRowCount);
        });
      },
    );
  });

  it("should support expressions in join conditions referencing model columns", () => {
    H.visitModel(ORDERS_MODEL_ID);
    H.openNotebook();

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Orders Model").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[ID] + [User ID]" });
      cy.button("Done").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[ID] + [Product ID]" });
      cy.button("Done").click();
    });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
    });

    H.visualize();
    H.assertQueryBuilderRowCount(9);
  });

  it("should allow to update a join with a join condition with custom expressions", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Reviews").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "1" });
      cy.button("Done").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "1" });
      cy.button("Done").click();
    });

    H.getNotebookStep("join").findByLabelText("Change operator").click();
    H.popover().findByText("=").click();
    H.getNotebookStep("join").findByLabelText("Change join type").click();
    H.popover().findByText("Inner join").click();
    H.getNotebookStep("join")
      .findByLabelText("Left column")
      .findByText("1")
      .click();
    H.enterCustomColumnDetails({ formula: "[ID] + 1" });
    H.popover().button("Update").click();
    H.getNotebookStep("join")
      .findByLabelText("Right column")
      .findByText("1")
      .click();
    H.enterCustomColumnDetails({ formula: "[Reviews → ID] + 1" });
    H.popover().button("Update").click();

    H.visualize();
    H.assertTableRowsCount(1112);
  });
});
