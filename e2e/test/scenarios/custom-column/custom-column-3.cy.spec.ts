const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { Field } from "metabase-types/api";

const { ORDERS_ID, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > question > custom column > path", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function assertTableData({ title, value }: { title: string; value: string }) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.tableInteractive()
      .findAllByTestId("header-cell")
      .last()
      .should("have.text", title);

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.tableInteractiveBody()
      .findAllByTestId("cell-data")
      .last()
      .should("have.text", value);
  }

  it("should allow to use a path function", () => {
    const CC_NAME = "URL_URL";
    const questionDetails: StructuredQuestionDetails = {
      name: "path from url",
      query: {
        "source-table": PEOPLE_ID,
        limit: 1,
        expressions: {
          [CC_NAME]: [
            "concat",
            "http://",
            ["domain", ["field", PEOPLE.EMAIL, null]],
            ".com/my/path",
          ],
        },
      },
      type: "model",
    };

    H.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "modelId",
    });

    cy.get<number>("@modelId").then((modelId) => {
      H.setModelMetadata(modelId, (field: Field) => {
        if (field.name === CC_NAME) {
          return { ...field, semantic_type: "type/URL" };
        }

        return field;
      });

      H.visitModel(modelId);
    });

    H.openNotebook();

    cy.log("add a new expression");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: `Path([${CC_NAME}])`,
      name: "extracted path",
    });

    H.popover().button("Done").click();
    H.visualize();
    cy.findByTestId("table-scroll-container").scrollTo("right");

    const extractedValue = "/my/path";
    assertTableData({
      title: "extracted path",
      value: extractedValue,
    });
  });
});

describe(
  "scenarios > question > custom column > data type > date functions",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
    });

    it("should understand date functions", () => {
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("QA Postgres12").click();
        cy.findByText("Orders").click();
      });

      const dateColumns = [
        { name: "Year", formula: "year([Created At])" },
        { name: "Quarter", formula: "quarter([Created At])" },
        { name: "Month", formula: "month([Created At])" },
        { name: "Week", formula: 'week([Created At], "iso")' },
        { name: "Day", formula: "day([Created At])" },
        { name: "Weekday", formula: "weekday([Created At])" },
        { name: "Hour", formula: "hour([Created At])" },
        { name: "Minute", formula: "minute([Created At])" },
        { name: "Second", formula: "second([Created At])" },
        {
          name: "Datetime Add",
          formula: 'datetimeAdd([Created At], 1, "month")',
        },
        {
          name: "Datetime Subtract",
          formula: 'datetimeSubtract([Created At], 1, "month")',
        },
        {
          // Created At has no timezone on this database, so the source timezone is required
          name: "ConvertTimezone",
          formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")',
        },
      ];

      dateColumns.forEach((column, index) => {
        if (index) {
          H.getNotebookStep("expression").icon("add").click();
        } else {
          cy.findByLabelText("Custom column").click();
        }

        H.enterCustomColumnDetails(column);
        H.expressionEditorWidget().button("Done").click();
      });

      H.visualize((response) => {
        expect(response?.body.error).to.not.exist;
      });
    });
  },
);

describe("scenarios > question > custom column > aggregation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to reorder aggregations with the same name", () => {
    H.createQuestion(
      {
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.summarize({ mode: "notebook" });

    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("Count() + 1");
    H.CustomExpressionEditor.nameInput().type("Count");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Count] + 1");
    H.CustomExpressionEditor.nameInput().type("Count");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Count] + 2");
    H.CustomExpressionEditor.nameInput().type("Final");
    H.popover().button("Done").click();

    cy.log("Both the secound Count and Final should reference the first Count");
    H.visualize();
    H.assertTableData({
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,761", "18,762", "18,763"]],
    });

    H.openNotebook();

    cy.log("Move the second Count to be the first");
    H.getNotebookStep("summarize")
      .findAllByText("Count")
      .should("have.length", 2)
      .last()
      .as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", {
      horizontal: -400,
      useMouseEvents: true,
    });

    cy.log("The values should not have changed, but the order should have");
    H.visualize();
    H.assertTableData({
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,762", "18,761", "18,763"]],
    });
  });
});
