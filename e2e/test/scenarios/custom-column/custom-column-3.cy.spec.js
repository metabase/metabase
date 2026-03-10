const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > question > custom column > distinctIf", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to use a distinctIf function", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.log("add a new expression");
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: "DistinctIf([ID], [Category] = 'Gadget')",
      name: "Distinct",
    });
    H.popover().button("Done").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "53");

    cy.log("modify the expression");
    H.openNotebook();
    H.getNotebookStep("summarize").findByText("Distinct").click();
    H.CustomExpressionEditor.value().should(
      "eq",
      'DistinctIf([ID], [Category] = "Gadget")',
    );
    H.enterCustomColumnDetails({
      formula: "DistinctIf([ID], [Category] != 'Gadget')",
      name: "Distinct",
    });
    H.popover().button("Update").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "147");
  });
});

describe("scenarios > question > custom column > path", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function assertTableData({ title, value }) {
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
    const questionDetails = {
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

    cy.get("@modelId").then((modelId) => {
      H.setModelMetadata(modelId, (field) => {
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

describe("scenarios > question > custom column > function browser", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.openProductsTable({ mode: "notebook" });
    H.addCustomColumn();
  });

  it("should be possible to insert functions by clicking them in the function browser", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser()
      .findByText("datetimeAdd")
      .click();

    H.CustomExpressionEditor.value().should("equal", "datetimeAdd()");

    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should("equal", "datetimeAdd(day())");

    H.CustomExpressionEditor.type('"foo"{rightarrow}, ', { focus: false });
    H.CustomExpressionEditor.value().should(
      "equal",
      'datetimeAdd(day("foo"), )',
    );

    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should(
      "equal",
      'datetimeAdd(day("foo"), day())',
    );
  });

  it("should be possible to replace text when inserting functions", () => {
    H.CustomExpressionEditor.type("foo bar baz");
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);

    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should("equal", "foo day() baz");
  });

  it("should be possible to filter functions in the function browser", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("con");

      cy.findByText("datetimeAdd").should("not.exist");
      cy.findByText("concat").should("be.visible");
      cy.findByText("second").should("be.visible");
      //
      cy.findByPlaceholderText("Search functions…").clear();
      cy.findByText("datetimeAdd").should("exist");
    });
  });

  it("should not show functions that are not supported by the current database", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("convertTimezone");
      cy.findByText("convertTimezone").should("not.exist");
    });
  });

  it("should not show aggregations unless aggregating", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("Count");
      cy.findByText("Count").should("not.exist");
    });
    H.expressionEditorWidget().button("Cancel").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search aggregations…").type("Count");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("show a message when no functions match the filter", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("foobar");
      cy.findByText("Didn't find any results").should("be.visible");
    });
  });

  it("should insert parens even when the clause has no arguments", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("now");
      cy.findByText("now").click();
    });
    H.CustomExpressionEditor.value().should("equal", "now()");
  });
});

describe("scenarios > question > custom column > splitPart", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("People").click();
    });

    cy.findByLabelText("Custom column").click();
  });

  function assertTableData({ title, value }) {
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

  it("should be possible to split a custom column", () => {
    const CC_NAME = "Split Title";

    H.enterCustomColumnDetails({
      formula: "splitPart([Name], ' ', 1)",
      name: CC_NAME,
    });
    H.popover().button("Done").click();

    cy.findByLabelText("Row limit").click();
    cy.findByPlaceholderText("Enter a limit").type(1).blur();

    H.visualize();

    H.tableInteractiveScrollContainer().scrollTo("right");
    assertTableData({ title: CC_NAME, value: "Hudson" });
  });

  it("should show a message when index is below 1", () => {
    H.enterCustomColumnDetails({
      formula: "splitPart([Name], ' ', 0)",
    });

    H.popover().button("Done").should("be.disabled");
    H.popover().should("contain", "Expected positive integer but found 0");
  });
});

describe("exercise today() function", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should show today's date", () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").click();
    cy.realPress("Escape");

    H.visualize();
    H.assertQueryBuilderRowCount(200);
    H.openNotebook();

    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({ formula: "today()", name: "TODAY" });
    H.popover().button("Done").click();

    const today = new Date();
    const dateString = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    H.visualize();
    cy.findAllByTestId("header-cell").eq(1).should("have.text", "TODAY");
    cy.findAllByTestId("cell-data").eq(3).should("have.text", dateString);
  });
});

describe("scenarios > question > custom column > aggregation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should be possible to resolve aggregations from the question", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();

    H.CustomExpressionEditor.type("[Custom");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.type("+ 1");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should be possible to resolve aggregations from the question directly", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();

    H.CustomExpressionEditor.type("[Custom");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should be possible to resolve aggregations from the previous stage", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    cy.findAllByLabelText("Custom column").eq(1).click();
    H.CustomExpressionEditor.type("[Custom S");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should not be possible to create cycles in custom aggregations", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Custom Sum] + 1");
    H.CustomExpressionEditor.nameInput().type("Custom Sum 2");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").findByText("Custom Sum").click();
    H.CustomExpressionEditor.clear().type("[Custom Sum 2]");

    H.popover()
      .findByText("Cycle detected: Custom Sum → Custom Sum 2 → Custom Sum")
      .should("be.visible");
  });

  it("should be possible to create aggregations with the same name", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Foo",
                "display-name": "Foo",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("Min([Total])");
    H.CustomExpressionEditor.nameInput().type("Foo");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").within(() => {
      cy.findAllByText("Foo").should("have.length", 2);
    });
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
    H.moveDnDKitElementByAlias("@dragElement", { horizontal: -400 });

    cy.log("The values should not have changed, but the order should have");
    H.visualize();
    H.assertTableData({
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,762", "18,761", "18,763"]],
    });
  });

  describe("scenarios > question > custom column > aggregation > as question source", () => {
    beforeEach(() => {
      H.createQuestion({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "min",
                [
                  "field",
                  ORDERS.SUBTOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              {
                name: "Foo",
                "display-name": "Foo",
              },
            ],
            [
              "aggregation-options",
              [
                "+",
                [
                  "aggregation",
                  0,
                  {
                    "base-type": "type/Float",
                  },
                ],
                [
                  "avg",
                  [
                    "field",
                    ORDERS.TAX,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
              ],
              {
                name: "Bar",
                "display-name": "Bar",
              },
            ],
          ],
        },
      }).then((res) => {
        H.visitQuestionAdhoc(
          {
            type: "question",
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": `card__${res.body.id}`,
              },
            },
          },
          { mode: "notebook" },
        );
      });
    });

    it("should be possible to use a question with nested aggregations as the source of another question", () => {
      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in custom columns of a new question", () => {
      H.addCustomColumn();
      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Foo", "Bar", "Sum"],
        firstRows: [["15.69", "19.55", "35.24"]],
      });
    });

    it("should be possible to use nested aggregations in filter clause of a new question", () => {
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("Bar").click();
        cy.findByPlaceholderText("Min").type("5");
        cy.findByPlaceholderText("Max").type("20");
        cy.button("Add filter").click();
      });
      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a new question", () => {
      H.join();
      H.joinTable("Products");
      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join").button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["15.69", "19.55", "61"]],
      });
    });

    it("should be possible to use nested aggregations in order by clause of a new question", () => {
      H.sort();
      H.popover().findByText("Bar").click();

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in breakout of a new question", () => {
      H.summarize({ mode: "notebook" });
      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByText("Bar").click();

      H.visualize();
      cy.findByTestId("scalar-value").should("have.text", "19.55");
    });
  });

  describe("scenarios > question > custom column > aggregation > in a follow up stage", () => {
    beforeEach(() => {
      H.createQuestion(
        {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                [
                  "min",
                  [
                    "field",
                    ORDERS.SUBTOTAL,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
                {
                  name: "Foo",
                  "display-name": "Foo",
                },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  [
                    "aggregation",
                    0,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                  [
                    "avg",
                    [
                      "field",
                      ORDERS.TAX,
                      {
                        "base-type": "type/Float",
                      },
                    ],
                  ],
                ],
                {
                  name: "Bar",
                  "display-name": "Bar",
                },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
      H.openNotebook();
    });

    it("should be possible to use nested aggregations in custom columns of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.addCustomColumn();
      });

      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Foo", "Bar", "Sum"],
        firstRows: [["15.69", "19.55", "35.24"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.join();
      });

      H.joinTable("Products");
      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join", { stage: 1 }).button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["15.69", "19.55", "61"]],
      });
    });
  });

  describe("scenarios > question > custom column > aggregation with breakout > in a follow up stage", () => {
    beforeEach(() => {
      H.createQuestion(
        {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                [
                  "min",
                  [
                    "field",
                    ORDERS.SUBTOTAL,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
                {
                  name: "Foo",
                  "display-name": "Foo",
                },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  [
                    "aggregation",
                    0,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                  [
                    "avg",
                    [
                      "field",
                      ORDERS.TAX,
                      {
                        "base-type": "type/Float",
                      },
                    ],
                  ],
                ],
                {
                  name: "Bar",
                  "display-name": "Bar",
                },
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
      H.openNotebook();
    });

    it("should be possible to use nested aggregations in custom columns of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.addCustomColumn();
      });
      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar", "Sum"],
        firstRows: [["April 2022", "49.54", "52.76", "102.29"]],
      });
    });

    it("should be possible to use nested aggregations in filter clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.filter({ mode: "notebook" });
      });
      H.popover().within(() => {
        cy.findByText("Bar").click();
        cy.findByPlaceholderText("Min").type("5");
        cy.findByPlaceholderText("Max").type("20");
        cy.button("Add filter").click();
      });
      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar"],
        firstRows: [["September 2022", "15.69", "18.57"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.join();
      });
      H.joinTable("Products");

      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join", { stage: 1 }).button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["April 2022", "49.54", "52.76", "34"]],
      });
    });

    it("should be possible to use nested aggregations in order by clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.sort();
      });
      H.popover().findByText("Bar").click();

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar"],
        firstRows: [["April 2023", "15.69", "18.21"]],
      });
    });

    it("should be possible to use nested aggregations in breakout of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.summarize({ mode: "notebook" });
      });

      H.popover().findByText("Count of rows").click();

      H.visualize();
      H.assertTableData({
        columns: ["Count"],
        firstRows: [["49"]],
      });
    });

    it("should be possible reference both aggregations with same name in follow up stage", () => {
      H.openOrdersTable({ mode: "notebook" });

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

      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByText("Created At").click();

      cy.log("Filter by the first Count");
      H.getNotebookStep("summarize").within(() => {
        H.filter({ mode: "notebook" });
      });
      H.popover().within(() => {
        cy.findAllByText("Count").should("have.length", 2);

        cy.findAllByText("Count").eq(0).click();

        // if this was referencing the second Count, it would filter out all rows
        cy.findByPlaceholderText("Max").type("2.5");
        cy.button("Add filter").click();
      });

      cy.log("Filter by the second Count");
      H.getNotebookStep("filter", { stage: 1 }).icon("add").click();
      H.popover().within(() => {
        cy.findAllByText("Count").should("have.length", 2);

        cy.findAllByText("Count").eq(1).click();

        // if this was referencing the first Count, it would filter out all rows
        cy.findByPlaceholderText("Min").type("2.5");
        cy.button("Add filter").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Count", "Count"],
        firstRows: [["April 2022", "2", "3"]],
      });

      cy.log(
        "Swapping the aggregation clauses should not change the results, but the column order will be different",
      );
      H.openNotebook();
      H.getNotebookStep("summarize")
        .findAllByText("Count")
        .should("have.length", 2)
        .last()
        .as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", { horizontal: -400 });

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Count", "Count"],
        firstRows: [["April 2022", "3", "2"]],
      });
    });
  });

  it("should show a custom error when there are no aggregations in a custom aggregation", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("1 + 1");
    H.popover()
      .findByText(
        "Aggregations should contain at least one aggregation function.",
      )
      .should("be.visible");
  });
});
