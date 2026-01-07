import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openNotebook } from "e2e/support/helpers";
import type { Measure, TableId } from "metabase-types/api";

const { H } = cy;
const { MeasureEditor } = H.DataModel;
const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const MEASURE_NAME = "Table Measure";

describe("scenarios > data studio > measures > queries", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("measures queries", () => {
    it("should create a measure with an aggregation without columns", () => {
      startNewMeasure();

      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Count of rows").click();

      saveMeasure();
      useMeasureInAdhocQuestion();
      verifyScalarValue("18,760");
    });

    it("should create a measure with with a column from the main data source", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("1,510,621.68");
    });

    it("should create a measure with with a column from the main data source using offset", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("Offset(Sum([Total]), -1)");
      H.CustomExpressionEditor.nameInput().type("Offset Measure");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion({
        customizeQuery() {
          breakout("Created At");
        },
      });
      verifyRowValues([["April 2022"], ["May 2022", "52.76"]]);
    });

    it("should create a measure with a column from an implicit join", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().within(() => {
        cy.findByText("Average of ...").click();
        cy.findByText("Product").click();
        cy.findByText("Price").click();
      });
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("55.69");
    });

    it("should create a measure with a column from an implicit join using offset", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("Offset(Average([Product -> Price]), -1)");
      H.CustomExpressionEditor.nameInput().type("Offset Measure");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion({
        customizeQuery() {
          breakout("Created At");
        },
      });
      verifyRowValues([["April 2022"], ["May 2022", "49.54"]]);
    });

    it("should create a measure with a custom aggregation expression", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type(
        "DistinctIf([Product → ID], [ID] > 1) + DistinctIf([ID], [Product → ID] > 1)",
      );
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("18,867");
    });

    it("should create a measure based on a segment", () => {
      H.createSegment({
        name: "TotalSegment",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("CountIf([TotalSegment])");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("13,005");
    });

    it("should create a measure based on another measure with an identity expression", () => {
      H.createMeasure({
        name: "TotalMeasure",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("[TotalMeasure]");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("1,510,621.68");
    });

    it("should create a measure based on another measure", () => {
      H.createMeasure({
        name: "TotalMeasure",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("floor([TotalMeasure])");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("1,510,621");
    });

    it("should create a measure based on another measure with an identity expression", () => {
      H.createMeasure({
        name: "TotalMeasure",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("[TotalMeasure]");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("1,510,621.68");
    });

    it("should not be possible to create a measure that references itself", () => {
      cy.log("create a new measure");
      H.DataStudio.Tables.visitNewMeasurePage(ORDERS_ID);

      MeasureEditor.getNameInput().type(MEASURE_NAME);
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Count of rows").click();

      MeasureEditor.getSaveButton().click();
      H.undoToast().should("contain.text", "Measure created");

      MeasureEditor.get().findByText("Count").click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.clear().type("[Table Measure]").blur();

      H.popover().button("Update").click();
      MeasureEditor.getSaveButton().click();

      H.undoToast().should("contain.text", "Failed to update measure");
    });

    it("should not be possible to create a measure that references a metric", () => {
      H.createQuestion({
        name: "OrdersCount",
        type: "metric",
        description: "A metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });

      H.DataStudio.Tables.visitNewMeasurePage(ORDERS_ID);
      MeasureEditor.getNameInput().type(MEASURE_NAME);
      MeasureEditor.getAggregationPlaceholder().click();

      H.popover().findByText("Metrics").should("not.exist");
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("[OrdersCount]").blur();
      H.popover()
        .findByText("Unknown Aggregation, Measure or Metric: OrdersCount")
        .should("be.visible");
      H.popover().button("Done").should("be.disabled");
    });

    it("should be possible to create measures with filters like CountIf", () => {
      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("CountIf([Total] > 10)");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("18,758");
    });

    it("should be possible to create measures with filters like CountIf based on segments", () => {
      H.createSegment({
        name: "LargeTotal",
        table_id: ORDERS_ID,
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        },
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("CountIf([LargeTotal])");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("18,758");
    });

    it("should be possible to create measures with filters like based on segments that are nested", () => {
      H.createSegment({
        name: "LargeTotal",
        table_id: ORDERS_ID,
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        },
      }).then(({ body: segment }) => {
        H.createSegment({
          name: "NestedSegment",
          table_id: ORDERS_ID,
          definition: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: [
                "or",
                ["<", ["field", ORDERS.TOTAL, null], 5],
                ["segment", segment.id],
              ],
            },
          },
        });
      });

      startNewMeasure();
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("CountIf([NestedSegment])");
      H.CustomExpressionEditor.nameInput().type("Custom");
      H.popover().button("Done").click();
      saveMeasure();

      useMeasureInAdhocQuestion();
      verifyScalarValue("18,759");
    });

    it("should be possible to offset a measure in a query", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      useMeasureInAdhocQuestion({
        customizeQuery() {
          H.getNotebookStep("summarize").findByText("Table Measure").click();
          H.CustomExpressionEditor.clear().type(
            `Offset([${MEASURE_NAME}], -1)`,
          );
          H.popover().button("Update").click();

          breakout("Created At");
        },
      });

      verifyRowValues([["April 2022"], ["May 2022", "52.76"]]);
    });
  });

  it("should be possible to order by an aggregation using a measure directly", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    useMeasureInAdhocQuestion({
      customizeQuery() {
        breakout("Created At");

        H.sort();
        H.popover().findByText("Table Measure").click();
        H.getNotebookStep("sort").findByText("Table Measure").click();
      },
    });

    verifyRowValues([
      ["January 2026", "52,249.59"],
      ["January 2025", "51,634.16"],
    ]);
  });

  it("should be possible to order by an aggregation using a custom expression based on a measure", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

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
      ["August 2023", "16"],
      ["April 2026", "16"],
      ["May 2022", "17"],
    ]);
  });

  describe("follow up stages", () => {
    it("should be possible to use results of a measure in follow up stages", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

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
    });

    it("should be possible to join on a measure in a follow up stage", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

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

      verifyRowValues([["April 2022", "52.76", "8685"]]);
    });
  });

  it("should be possible to join on a measure in a follow up stage with a custom expression", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });
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

    verifyRowValues([["April 2022", "52.76", "5", "1"]]);
  });

  describe("measure refs", () => {
    it("should be possible to rename a measure without breaking queries that reference it", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      }).then(({ body: measure }) => {
        useMeasureInAdhocQuestion();

        H.updateMeasure({
          id: measure.id,
          name: "Renamed measure",
        });

        cy.reload();
        verifyScalarValue("1,510,621.68");
      });
    });

    it("should be possible to rename an aggregation expression based on a measure without breaking it", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

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
    });

    it("changing the top-level aggregation expression in a measure might break queries that reference it in follow up stages", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
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
          openNotebook();
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
              "source-table": ORDERS_ID,
              aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
            },
          });

          cy.log("Add a second stage that references the measure");
          H.visitQuestion(question.id);
          cy.findByTestId("query-builder-main")
            .findByText("There was a problem with your question")
            .should("be.visible");
        });
      });
    });
  });

  it("should be possible to use a measure in a pivot table", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    }).then(({ body: measure }) => {
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
              ["measure", { "display-name": measure.name }, measure.id],
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
  });

  describe("using measures in saved questions", () => {
    it("should be possible to use measure results in a saved question as source for a follow up question", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      }).then(({ body: measure }) => {
        H.createQuestion({
          name: "Question with measure",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": measure.name }, measure.id],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
            ],
          },
        }).then(({ body: question }) => {
          H.createQuestion(
            {
              query: {
                "source-table": `card__${question.id}`,
              },
              display: "scalar",
            },
            { visitQuestion: true },
          );
        });
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
    });

    it("should be possible to use measure results in a saved question as source for a follow up model", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      }).then(({ body: measure }) => {
        H.createQuestion({
          name: "Question with measure",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["measure", { "display-name": measure.name }, measure.id],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
            ],
          },
        }).then(({ body: question }) => {
          H.createQuestion(
            {
              type: "model",
              query: {
                "source-table": `card__${question.id}`,
              },
              display: "scalar",
            },
            { visitQuestion: true },
          );
        });
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
    });

    it("should be possible x-ray a question containing a measure", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      })
        .then(({ body: measure }) => {
          H.createQuestion({
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
          });
        })
        .then(({ body: model }) => {
          cy.visit(`/auto/dashboard/question/${model.id}`);

          H.main()
            .findByText("A look at the Table Measure")
            .should("be.visible");
        });
    });
  });

  describe("using measures in models", () => {
    it("should be possible x-ray a model containing a measure", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      })
        .then(({ body: measure }) => {
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
          });
        })
        .then(({ body: model }) => {
          cy.visit(`/auto/dashboard/model/${model.id}`);

          H.main()
            .findByText("A look at the Table Measure")
            .should("be.visible");
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
