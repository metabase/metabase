const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > custom column > field resolution", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should be possible to resolve fields in custom columns", () => {
    const QUESTION: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          FOO: ["value", "upper"],
          foo: ["value", "lower"],
          Foo: ["value", "sentence"],
          FoO: ["value", "silly"],
        },
        filter: ["=", ["field", ORDERS.ID, null], 1],
        limit: 1,
        fields: [["field", ORDERS.ID, null]],
      },
    };

    H.createQuestion(QUESTION, { visitQuestion: true });
    H.openNotebook();

    Object.entries(QUESTION.query.expressions ?? []).forEach(
      ([name, expression]) => {
        const str = (expression as ["value", string])[1];
        H.getNotebookStep("expression").icon("add").click();

        const expr = `[${name}]`;
        H.enterCustomColumnDetails({ formula: expr, name: "Custom" });
        H.CustomExpressionEditor.format();
        H.CustomExpressionEditor.value().should("eq", expr);
        H.popover().button("Done").click();

        H.visualize();
        H.assertTableData({
          columns: ["ID", "Custom"],
          firstRows: [["1", str]],
        });

        H.openNotebook();
        H.getNotebookStep("expression")
          .icon("close")
          .should("have.length", 6)
          .last()
          .click();
      },
    );
  });

  it("should be possible to resolve fields in using different separators", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();

    [
      "[Product → Title]",
      "[Product.Title]",
      "[product → title]",
      "[product.title]",
    ].forEach((expr) => {
      H.CustomExpressionEditor.type(expr);
      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should("eq", "[Product → Title]");
      H.CustomExpressionEditor.clear();
    });
  });
});
