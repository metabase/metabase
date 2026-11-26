import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Measure, TableId } from "metabase-types/api";

const { H } = cy;
const { MeasureEditor } = H.DataModel;
const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const MEASURE_NAME = "Table Measure";

describe("scenarios > data studio > measures > queries", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  describe("measures queries", () => {
    it("should create a measure in the measure editor and use it in a query", () => {
      startNewMeasure();

      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Count of rows").click();

      saveMeasure().then((measure) => {
        cy.log("the page opens the created measure, which survives a reload");
        cy.location("pathname").should(
          "eq",
          `/data-studio/library/tables/${ORDERS_ID}/measures/${measure.id}`,
        );
        cy.reload();
        MeasureEditor.getNameInput().should("have.value", MEASURE_NAME);
        MeasureEditor.get().findByText("Count").should("be.visible");
      });

      useMeasureInAdhocQuestion();
      verifyScalarValue("18,760");
    });

    it("should compute measures based on columns, implicit joins, custom expressions, segments and other measures", () => {
      const TOTAL = ["field", ORDERS.TOTAL, null];
      const ID = ["field", ORDERS.ID, null];
      const PRODUCT_ID = [
        "field",
        PRODUCTS.ID,
        { "source-field": ORDERS.PRODUCT_ID },
      ];
      const PRODUCT_PRICE = [
        "field",
        PRODUCTS.PRICE,
        { "source-field": ORDERS.PRODUCT_ID },
      ];

      createOrdersSegment("TotalSegment", ["<", TOTAL, 100]).then(
        (totalSegmentId) => {
          createOrdersMeasure("CountIf segment", [
            "count-where",
            ["segment", totalSegmentId],
          ]).then((measureId) => verifyMeasureScalar(measureId, "13,005"));
        },
      );

      createOrdersSegment("LargeTotal", [">", TOTAL, 10]).then(
        (largeTotalSegmentId) => {
          createOrdersSegment("NestedSegment", [
            "or",
            ["<", TOTAL, 5],
            ["segment", largeTotalSegmentId],
          ]).then((nestedSegmentId) => {
            createOrdersMeasure("CountIf nested segment", [
              "count-where",
              ["segment", nestedSegmentId],
            ]).then((measureId) => verifyMeasureScalar(measureId, "18,759"));
          });
        },
      );

      createOrdersMeasure("Sum of Total", ["sum", TOTAL]).then(
        (totalMeasureId) => {
          verifyMeasureScalar(totalMeasureId, "1,510,621.68");

          createOrdersMeasure("Identity measure", [
            "measure",
            totalMeasureId,
          ]).then((measureId) =>
            verifyMeasureScalar(measureId, "1,510,621.68"),
          );

          createOrdersMeasure("Floor measure", [
            "floor",
            ["measure", totalMeasureId],
          ]).then((measureId) => verifyMeasureScalar(measureId, "1,510,621"));
        },
      );

      createOrdersMeasure("Average of Product Price", [
        "avg",
        PRODUCT_PRICE,
      ]).then((measureId) => verifyMeasureScalar(measureId, "55.69"));

      createOrdersMeasure("DistinctIf", [
        "+",
        ["distinct-where", PRODUCT_ID, [">", ID, 1]],
        ["distinct-where", ID, [">", PRODUCT_ID, 1]],
      ]).then((measureId) => verifyMeasureScalar(measureId, "18,867"));

      createOrdersMeasure("CountIf", ["count-where", [">", TOTAL, 10]]).then(
        (measureId) => verifyMeasureScalar(measureId, "18,758"),
      );

      createOrdersMeasure("Offset of Sum of Total", [
        "offset",
        {},
        ["sum", TOTAL],
        -1,
      ]).then((measureId) => {
        visitMeasureByMonth(measureId);
        verifyRowValues([["April 2025"], ["May 2025", "52.76"]]);
      });

      createOrdersMeasure("Offset of Average of Product Price", [
        "offset",
        {},
        ["avg", PRODUCT_PRICE],
        -1,
      ]).then((measureId) => {
        visitMeasureByMonth(measureId);
        verifyRowValues([["April 2025"], ["May 2025", "49.54"]]);
      });
    });
  });

  it("should be possible to use a measure in queries, follow up stages, pivot tables and saved questions, and to rename the measure without breaking queries", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      definition: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      },
    }).then(({ body: measure }) => {
      cy.wrap(measure.id).as("measureId");
    });

    cy.log("offset the measure in a query");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        H.getNotebookStep("summarize").findByText("Table Measure").click();
        H.CustomExpressionEditor.clear().type(`Offset([${MEASURE_NAME}], -1)`);
        H.popover().button("Update").click();

        breakout("Created At");
      },
    });

    verifyRowValues([["April 2025"], ["May 2025", "52.76"]]);

    cy.log("order by the measure directly");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        breakout("Created At");

        H.sort();
        H.popover().findByText("Table Measure").click();
        H.getNotebookStep("sort").findByText("Table Measure").click();
      },
    });

    verifyRowValues([
      ["January 2029", "52,249.59"],
      ["January 2028", "51,634.16"],
    ]);

    cy.log("order by a custom expression based on the measure");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        H.getNotebookStep("summarize").findByText("Table Measure").click();
        cy.log("Use weird formula to get different ordering in results");
        H.CustomExpressionEditor.clear().type(
          `length(text(log([${MEASURE_NAME}])))`,
        );
        H.popover().button("Update").click();

        breakout("Created At");

        H.sort();
        H.popover().findByText("Table Measure").click();
      },
    });

    verifyRowValues([
      ["August 2026", "16"],
      ["April 2029", "16"],
      ["May 2025", "17"],
    ]);

    cy.log("use results of the measure in follow up stages");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        breakout("Created At");

        H.getNotebookStep("summarize").button("Filter").click();
        H.popover().within(() => {
          cy.findByText(MEASURE_NAME).click();
          cy.findByPlaceholderText("Min").type("100");
          cy.button("Add filter").click();
        });

        H.getNotebookStep("summarize").button("Custom column").click();
        H.enterCustomColumnDetails({
          formula: `floor([${MEASURE_NAME}] * 2)`,
          name: "Double measure",
          clickDone: true,
        });

        H.getNotebookStep("filter", { stage: 1 })
          .findByText("Summarize")
          .click();
        H.popover().within(() => {
          cy.findByText("Minimum of ...").click();
          cy.findByText("Double measure").click();
        });
      },
    });
    verifyScalarValue("2,531");

    cy.log("join on the measure in a follow up stage");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        breakout("Created At");

        H.getNotebookStep("summarize").button("Join data").click();
        H.popover().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("Orders").click();
        });

        H.popover().findByText("Table Measure").click();
        H.popover().findByText("Total").click();
      },
    });

    verifyRowValues([["April 2025", "52.76", "8685"]]);

    cy.log("join on the measure in a follow up stage with a custom expression");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        breakout("Created At");

        H.getNotebookStep("summarize").button("Join data").click();
        H.popover().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("Orders").click();
        });

        H.popover().findByText("Custom Expression").click();

        H.CustomExpressionEditor.clear()
          .type("floor([Table Measure]/10)")
          .blur();
        H.popover().findByText("Done").click();

        H.popover().findByText("ID").click();
      },
    });

    verifyRowValues([["April 2025", "52.76", "5", "1"]]);

    cy.log("rename an aggregation expression based on the measure");
    useMeasureInAdhocQuestion({
      customizeQuery() {
        H.getNotebookStep("summarize").findByText("Table Measure").click();
        H.CustomExpressionEditor.nameInput()
          .clear()
          .type("Renamed aggregation");
        H.popover().button("Update").click();
      },
    });

    verifyScalarValue("1,510,621.68");

    cy.log("use the measure in a pivot table");
    cy.get<number>("@measureId").then((measureId) => {
      H.createQuestion(
        {
          name: "Question with measure",
          display: "pivot",
          visualization_settings: {
            "table.pivot_column": "Created At: Week",
            "table.cell_column": "Table Measure",
          },
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": MEASURE_NAME }, measureId],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
              [
                "field",
                PRODUCTS.CATEGORY,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
    });

    cy.findByTestId("pivot-table").within(() => {
      cy.findByText("Row totals").should("be.visible");
      cy.findByText("Grand totals").should("be.visible");
      cy.findAllByTestId("pivot-table-cell")
        .should("have.length", 42)
        .eq(12) // a random cell
        .should("have.text", "9,031.56");
    });

    cy.log("use the measure results in a saved question");
    cy.get<number>("@measureId").then((measureId) => {
      H.createQuestion({
        name: "Question with measure",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["measure", { "display-name": MEASURE_NAME }, measureId],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });
    });

    cy.log("follow up question");
    cy.get<number>("@questionId").then((questionId) => {
      H.createQuestion(
        {
          query: {
            "source-table": `card__${questionId}`,
          },
          display: "scalar",
        },
        { visitQuestion: true },
      );
    });

    H.openNotebook();

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText(MEASURE_NAME).click();
      cy.findByPlaceholderText("Min").type("100");
      cy.button("Add filter").click();
    });

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: `Sum([${MEASURE_NAME}])`,
      name: "Table Measure Sum",
      clickDone: true,
    });

    H.visualize();
    verifyScalarValue("1,510,568.93");

    cy.log("follow up model");
    cy.get<number>("@questionId").then((questionId) => {
      H.createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${questionId}`,
          },
          display: "scalar",
        },
        { visitQuestion: true },
      );
    });

    H.openQuestionActions("Edit query definition");

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText(MEASURE_NAME).click();
      cy.findByPlaceholderText("Min").type("100");
      cy.button("Add filter").click();
    });

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: `Sum([${MEASURE_NAME}])`,
      name: "Table Measure Sum",
      clickDone: true,
    });

    cy.findByTestId("dataset-edit-bar").button("Save changes").click();
    verifyScalarValue("1,510,568.93");

    cy.log("rename the measure without breaking queries that reference it");
    useMeasureInAdhocQuestion();

    cy.get<number>("@measureId").then((measureId) => {
      H.updateMeasure({
        id: measureId,
        name: "Renamed measure",
      });
    });

    cy.reload();
    verifyScalarValue("1,510,621.68");
  });

  describe("measure refs", () => {
    it("changing the top-level aggregation expression in a measure might break queries that reference it in follow up stages", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        definition: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
          },
        },
      }).then(({ body: measure }) => {
        H.createQuestion({
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": measure.name }, measure.id],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ],
          },
        }).then(({ body: question }) => {
          cy.log("Add a second stage that references the measure");
          H.visitQuestion(question.id);
          H.openNotebook();
          H.getNotebookStep("summarize").findByText("Filter").click();
          H.popover().within(() => {
            cy.findByText(MEASURE_NAME).click();
            cy.findByPlaceholderText("Min").type("10");
            cy.button("Add filter").click();
          });

          cy.findByTestId("qb-header").button("Save").click();
          H.modal().within(() => {
            cy.log("Ensure that 'Replace original question' is checked");
            cy.findByLabelText(/Replace original question/i).should(
              "be.checked",
            );
            cy.button("Save").click();
          });

          H.updateMeasure({
            id: measure.id,
            definition: {
              database: SAMPLE_DB_ID,
              type: "query",
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
              },
            },
          });

          cy.log("verify the question with the changed measure shows an error");
          H.visitQuestion(question.id);
          cy.findByTestId("query-builder-main")
            .findByText("There was a problem with your question")
            .should("be.visible");
        });
      });
    });
  });

  describe("x-rays", () => {
    it("should be possible to x-ray a question and a model containing a measure", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        definition: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
          },
        },
      }).then(({ body: measure }) => {
        cy.log("x-ray a question");
        H.createQuestion({
          name: "Test question",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": measure.name }, measure.id],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ],
          },
        }).then(({ body: question }) => {
          cy.visit(`/auto/dashboard/question/${question.id}`);
          H.main()
            .findByText("A look at the Table Measure")
            .should("be.visible");
        });

        cy.log("x-ray a model");
        H.createQuestion({
          type: "model",
          name: "Test model",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": measure.name }, measure.id],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ],
          },
        }).then(({ body: model }) => {
          cy.visit(`/auto/dashboard/model/${model.id}`);
          H.main()
            .findByText("A look at the Table Measure")
            .should("be.visible");
        });
      });
    });
  });
});

function startNewMeasure({
  name = MEASURE_NAME,
  tableId = ORDERS_ID,
}: {
  name?: string;
  tableId?: TableId;
} = {}) {
  cy.log("create a new measure");
  H.DataStudio.Tables.visitNewMeasurePage(tableId);
  MeasureEditor.getNameInput().type(name);
}

function saveMeasure(): Cypress.Chainable<Measure> {
  cy.intercept("POST", "/api/measure").as("measureCreate");
  MeasureEditor.getSaveButton().click();

  return cy.wait("@measureCreate").then(({ response }) => {
    H.undoToast().should("contain.text", "Measure created");
    // Unjustified type cast. FIXME
    return cy.wrap(response?.body as Measure);
  });
}

function useMeasureInAdhocQuestion({
  measureName = MEASURE_NAME,
  tableId = ORDERS_ID,
  customizeQuery,
}: {
  measureName?: string;
  tableId?: TableId;
  customizeQuery?: () => void;
} = {}) {
  cy.log("verify the measure works in query builder");
  H.openTable({ table: tableId, mode: "notebook" });
  H.summarize({ mode: "notebook" });
  H.popover().findByText("Measures").click();
  H.popover().findByText(measureName).click();

  customizeQuery?.();

  H.visualize();
}

function createOrdersSegment(
  name: string,
  filter: unknown[],
): Cypress.Chainable<number> {
  return H.createSegment({
    name,
    definition: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: { "source-table": ORDERS_ID, filter },
    },
  }).then(({ body }) => body.id);
}

function createOrdersMeasure(
  name: string,
  aggregation: unknown[],
): Cypress.Chainable<number> {
  return H.createMeasure({
    name,
    definition: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: { "source-table": ORDERS_ID, aggregation: [aggregation] },
    },
  }).then(({ body }) => body.id);
}

function measureQuery(measureId: number) {
  return {
    "source-table": ORDERS_ID,
    aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
  };
}

function verifyMeasureScalar(measureId: number, scalarValue: string) {
  H.visitQuestionAdhoc({
    display: "scalar",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: measureQuery(measureId),
    },
  });
  verifyScalarValue(scalarValue);
}

function visitMeasureByMonth(measureId: number) {
  H.visitQuestionAdhoc({
    display: "line",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        ...measureQuery(measureId),
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    },
  });
}

function breakout(columnName = "Created At") {
  H.getNotebookStep("summarize")
    .findByText("Pick a column to group by")
    .click();
  H.popover().findByText(columnName).click();
}

function verifyScalarValue(scalarValue: string) {
  H.queryBuilderMain()
    .findByTestId("scalar-value")
    .should("have.text", scalarValue);
  H.assertQueryBuilderRowCount(1);
}

// Custom implementation of H.assertTableData that allows for empty cells
function verifyRowValues(rowValues: string[][]) {
  cy.findByTestId("view-footer").within(() => {
    cy.findByLabelText("Switch to data").click(); // Switch to the tabular view...
  });

  rowValues.flat().forEach((value, index) => {
    H.tableInteractiveBody()
      .findAllByTestId("cell-data")
      .should("have.length.gt", rowValues.length)
      .eq(index)
      .should("have.text", value);
  });
}
