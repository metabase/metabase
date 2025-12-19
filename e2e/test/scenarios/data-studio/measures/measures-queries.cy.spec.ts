import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

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
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "18,760",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Count of rows").click();
        },
      });
    });

    it("should create a measure with with a column from the main data source", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "1,510,621.68",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Sum of ...").click();
            cy.findByText("Total").click();
          });
        },
      });
    });

    it("should create a measure with a column from an implicit join", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "55.69",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Average of ...").click();
            cy.findByText("Product").click();
            cy.findByText("Price").click();
          });
        },
      });
    });

    it("should create a measure with a custom aggregation expression", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "18,867",
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
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "13,005",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("CountIf([TotalSegment])");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
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
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "1,510,621.68",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("[TotalMeasure]");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
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
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "1,510,621.68",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().findByText("Custom Expression").click();
          H.CustomExpressionEditor.type("[TotalMeasure]");
          H.CustomExpressionEditor.nameInput().type("Custom");
          H.popover().button("Done").click();
        },
      });
    });

    it("should create a measure with with a column from the main data source", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "1,510,621.68",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Sum of ...").click();
            cy.findByText("Total").click();
          });
        },
      });
    });

    it("should create a measure with a column from an implicit join", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "55.69",
        createQuery: () => {
          MeasureEditor.getAggregationPlaceholder().click();
          H.popover().within(() => {
            cy.findByText("Average of ...").click();
            cy.findByText("Product").click();
            cy.findByText("Price").click();
          });
        },
      });
    });

    it("should create a measure with a custom aggregation expression", () => {
      verifyNewMeasure({
        tableId: ORDERS_ID,
        scalarValue: "18,867",
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
    });
  });
});

function verifyNewMeasure({
  tableId,
  scalarValue,
  createQuery,
}: {
  tableId: TableId;
  scalarValue: string;
  createQuery: () => void;
}) {
  cy.log("create a new measure");
  H.DataStudio.Tables.visitNewMeasurePage(ORDERS_ID);
  MeasureEditor.getNameInput().type(MEASURE_NAME);
  createQuery();
  MeasureEditor.getSaveButton().click();
  H.undoToast().should("contain.text", "Measure created");

  cy.log("verify the measure works in query builder");
  H.openTable({ table: tableId, mode: "notebook" });
  H.summarize({ mode: "notebook" });
  H.popover().findByText("Measures").click();
  H.popover().findByText(MEASURE_NAME).click();
  H.visualize();
  H.queryBuilderMain()
    .findByTestId("scalar-value")
    .should("have.text", scalarValue);
  H.assertQueryBuilderRowCount(1);
}
