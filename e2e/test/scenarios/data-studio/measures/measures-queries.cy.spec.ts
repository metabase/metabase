import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { H } = cy;
const { MeasureEditor } = H.DataModel;
const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const MEASURE_NAME = "Table Measure";

describe("scenarios > data studio > measures > queries", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("measures queries", () => {
    it("should create a measure with an aggregation without columns", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Count of rows").click();
        },
      });
      useMeasure();
      verifyScalarValue("18,760");
    });

    it("should create a measure with with a column from the main data source", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Sum of ...").click();
            cy.findByText("Total").click();
          });
        },
      });
      useMeasure();
      verifyScalarValue("1,510,621.68");
    });

    it("should create a measure with with a column from the main data source using offset", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("Offset(Sum([Total]), -1)");
          H.CustomExpressionEditor.nameInput().type("Offset Measure");
          H.popover().button("Done").click();
        },
      });
      useMeasure(() => {
        breakout("Created At");
      });
      verifyRowValues([["April 2022"], ["May 2022", "52.76"]]);
    });

    it("should create a measure with a column from an implicit join", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Average of ...").click();
            cy.findByText("Product").click();
            cy.findByText("Price").click();
          });
        },
      });
      useMeasure();
      verifyScalarValue("55.69");
    });

    it("should create a measure with a column from an implicit join using offset", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type(
            "Offset(Average([Product -> Price]), -1)",
          );
          H.CustomExpressionEditor.nameInput().type("Offset Measure");
          H.popover().button("Done").click();
        },
      });
      useMeasure(() => {
        breakout("Created At");
      });
      verifyRowValues([["April 2022"], ["May 2022", "49.54"]]);
    });

    it("should create a measure with a custom aggregation expression", () => {
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type(
            "DistinctIf([Product → ID], [ID] > 1) + DistinctIf([ID], [Product → ID] > 1)",
          );
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("CountIf([TotalSegment])");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("[TotalMeasure]");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("floor([TotalMeasure])");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("[TotalMeasure]");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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
      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("CountIf([Total] > 10)");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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

      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("CountIf([LargeTotal])");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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

      buildNewMeasure({
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("CountIf([NestedSegment])");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
      useMeasure();
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

      useMeasure(() => {
        H.getNotebookStep("summarize").findByText("Table Measure").click();
        H.CustomExpressionEditor.clear().type(`Offset([${MEASURE_NAME}], -1)`);
        H.popover().button("Update").click();

        breakout("Created At");
      });

      verifyRowValues([["April 2022"], ["May 2022", "52.76"]]);
    });
  });

  it.skip("should be possible to order by an aggregation using a measure directly", () => {
    H.createMeasure({
      name: MEASURE_NAME,
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    useMeasure(() => {
      breakout("Created At");

      H.sort();
      H.popover().findByText("Table Measure").click();
    });

    // TODO: fix this when sorting works
    verifyRowValues([["April 2022"], ["May 2022", "52.76"]]);
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

    useMeasure(() => {
      H.getNotebookStep("summarize").findByText("Table Measure").click();
      cy.log("Use weird formula to get different ordering in results");
      H.CustomExpressionEditor.clear().type(
        `length(text(log([${MEASURE_NAME}])))`,
      );
      H.popover().button("Update").click();

      breakout("Created At");

      H.sort();
      H.popover().findByText("Table Measure").click();
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

      useMeasure(() => {
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

      useMeasure(() => {
        breakout("Created At");

        H.getNotebookStep("summarize").button("Join data").click();
        H.popover().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("Orders").click();
        });

        H.popover().findByText("Table Measure").click();
        H.popover().findByText("Total").click();
      });

      verifyRowValues([["April 2022", "52.76", "8685"]]);
    });
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
    useMeasure(() => {
      breakout("Created At");

      H.getNotebookStep("summarize").button("Join data").click();
      H.popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.clear().type("floor([Table Measure]/10)").blur();
      H.popover().findByText("Done").click();

      H.popover().findByText("ID").click();
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
        useMeasure();

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

      useMeasure(() => {
        H.getNotebookStep("summarize").findByText("Table Measure").click();
        H.CustomExpressionEditor.nameInput()
          .clear()
          .type("Renamed aggregation");
        H.popover().button("Update").click();
      });

      verifyScalarValue("1,510,621.68");
    });
  });

  describe("dependency graph", () => {
    it("should display measures and their dependencies in the dependency graph", () => {
      H.createMeasure({
        name: MEASURE_NAME,
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      }).then(({ body: measure }) => {
        createQuestionWithMeasure({
          measureName: MEASURE_NAME,
          questionDetails: {
            type: "question",
            name: "Question using measure",
            query: {
              "source-table": ORDERS_ID,
            },
          },
        });

        createQuestionWithMeasure({
          measureName: MEASURE_NAME,
          questionDetails: {
            type: "model",
            name: "Model using measure",
            query: {
              "source-table": ORDERS_ID,
            },
          },
        });

        cy.visit(`/data-studio/dependencies?id=${measure.id}&type=measure`);

        H.DependencyGraph.graph().should("be.visible");
        H.DependencyGraph.graph().findByText(MEASURE_NAME).should("be.visible");

        cy.log("verify question dependency");
        H.DependencyGraph.graph()
          .findByLabelText(MEASURE_NAME)
          .findByText("1 question")
          .click();
        H.DependencyGraph.dependencyPanel()
          .findByText("Question using measure")
          .should("be.visible");

        cy.log("verify model dependency");
        H.DependencyGraph.graph()
          .findByLabelText(MEASURE_NAME)
          .findByText("1 model")
          .click();
        H.DependencyGraph.dependencyPanel()
          .findByText("Model using measure")
          .should("be.visible");
      });
    });
  });
});

function buildNewMeasure({ createQuery }: { createQuery: () => void }) {
  cy.log("create a new measure");
  H.DataStudio.Tables.visitNewMeasurePage(ORDERS_ID);
  MeasureEditor.getNameInput().type(MEASURE_NAME);
  createQuery();
  MeasureEditor.getSaveButton().click();
  H.undoToast().should("contain.text", "Measure created");
}

function useMeasure(beforeVisualize?: () => void) {
  cy.log("verify the measure works in query builder");
  H.openTable({ table: ORDERS_ID, mode: "notebook" });
  H.summarize({ mode: "notebook" });
  H.popover().findByText("Measures").click();
  H.popover().findByText(MEASURE_NAME).click();

  beforeVisualize?.();

  H.visualize();
}

function breakout(columnName = "Created At") {
  H.getNotebookStep("summarize")
    .findByText("Pick a column to group by")
    .click();
  H.popover().findByText(columnName).click();
}

function switchToData() {
  cy.findByTestId("view-footer").within(() => {
    cy.findByLabelText("Switch to data").click(); // Switch to the tabular view...
  });
}

function verifyScalarValue(scalarValue: string) {
  H.queryBuilderMain()
    .findByTestId("scalar-value")
    .should("have.text", scalarValue);
  H.assertQueryBuilderRowCount(1);
}

function verifyRowValues(rowValues: string[][]) {
  switchToData();
  // Custom implemtation that allows for empty cells
  rowValues.flat().forEach((value, index) => {
    H.tableInteractiveBody()
      .findAllByTestId("cell-data")
      .should("have.length.gt", rowValues.length)
      .eq(index)
      .should("have.text", value);
  });
}

function createQuestionWithMeasure({
  measureName = MEASURE_NAME,
  questionDetails: details = {
    name: "Custom Question",
    query: {
      "source-table": ORDERS_ID,
    },
  },
  after = () => {},
}: {
  measureName?: string;
  questionDetails?: StructuredQuestionDetails;
  after?: () => void;
}) {
  H.createQuestion(
    // TODO: I cannot get the createQuestion to work with measure aggregations
    // probably because there is some missing BE logic for converting MBQLv1
    // This helper therefore builds the measure in the FE.
    // "aggregation": [["measure", measureName]],
    details,
    { visitQuestion: true },
  ).then(() => {
    if (details.type === "model") {
      H.openQuestionActions("Edit query definition");
    } else {
      H.openNotebook();
    }

    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Measures").click();
      cy.findByText(measureName).click();
    });

    after();

    if (details.type === "model") {
      cy.findByTestId("dataset-edit-bar").button("Save changes").click();
    } else {
      cy.findByTestId("qb-header").button("Save").click();
      H.modal().findByText("Save").click();
    }
  });
}
