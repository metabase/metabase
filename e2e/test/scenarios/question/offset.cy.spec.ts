const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { uuid } from "metabase/utils/uuid";
import type {
  Aggregation,
  Breakout,
  FieldReference,
  StructuredQuery,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_TOTAL_FIELD_REF: FieldReference = [
  "field",
  ORDERS.TOTAL,
  { "base-type": "type/Float" },
];

const ORDERS_CREATED_AT_BREAKOUT: Breakout = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const SUM_TOTAL_AGGREGATION: Aggregation = ["sum", ORDERS_TOTAL_FIELD_REF];

const OFFSET_SUM_TOTAL_AGGREGATION_NAME = "Offsetted sum of total";

const OFFSET_SUM_TOTAL_AGGREGATION: Aggregation = [
  "offset",
  createOffsetOptions(OFFSET_SUM_TOTAL_AGGREGATION_NAME),
  SUM_TOTAL_AGGREGATION,
  -1,
];

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  describe("aggregations", () => {
    it("suggests and allows using offset(), but not in filters or custom columns", () => {
      const filterExpression = "Offset([Total], -1) > 0";
      const customColumnExpression = "Offset([Total], -1)";
      const expression = "Offset(Sum([Total]), -1)";
      const prefixLength = 3;
      const filterPrefix = filterExpression.substring(0, prefixLength);
      const customColumnPrefix = customColumnExpression.substring(
        0,
        prefixLength,
      );
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });
      H.openNotebook();

      cy.button("Filter").click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: filterPrefix, blur: false });

      cy.log("does not suggest offset() in filter expressions");
      H.CustomExpressionEditor.completions()
        .should("exist")
        .and("not.contain", "Offset");

      H.enterCustomColumnDetails({ formula: filterExpression });
      cy.realPress("Tab");

      H.expressionEditorWidget().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom filters").should(
          "exist",
        );
      });

      H.expressionEditorWidget().button("Cancel").click();
      H.popover().findByText("Custom Expression").should("be.visible");
      cy.realPress("Escape");
      H.popover({ skipVisibilityCheck: true }).should("not.exist");

      cy.button("Custom column").click();
      H.enterCustomColumnDetails({
        formula: customColumnPrefix,
        blur: false,
      });

      cy.log("does not suggest offset() in custom columns");
      H.CustomExpressionEditor.completions()
        .should("exist")
        .and("not.contain", "Offset");

      H.enterCustomColumnDetails({ formula: customColumnExpression });
      cy.realPress("Tab");

      H.expressionEditorWidget().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom columns").should(
          "exist",
        );
      });

      H.expressionEditorWidget().button("Cancel").click();
      H.expressionEditorWidget().should("not.exist");

      cy.button("Summarize").click();
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: prefix, blur: false });

      cy.log("suggests offset() in aggregation expressions");
      H.CustomExpressionEditor.completions().should("be.visible");
      H.CustomExpressionEditor.completion("Offset").should("exist");

      H.enterCustomColumnDetails({ formula: expression, blur: false });
      cy.realPress("Tab");

      H.expressionEditorWidget().within(() => {
        cy.button("Done").should("be.disabled");

        H.CustomExpressionEditor.nameInput()
          .clear()
          .type("My expression")
          .blur();

        cy.button("Done").should("be.enabled");
      });
    });

    it("works with a single breakout", () => {
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT],
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });

      verifyTableContent([
        ["April 2025", ""],
        ["May 2025", "52.76"],
      ]);
      verifyNoQuestionError();

      H.openNotebook();
      H.getNotebookStep("summarize").icon("play").should("be.visible");
    });

    it("works after saving a question (metabase#42323)", () => {
      const breakoutName = "Created At";

      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isFirst: true,
      });
      addBreakout(breakoutName);

      H.visualize();
      verifyLineChart({
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });
      verifyNoQuestionError();

      saveQuestion().then(({ response }) => {
        H.visitQuestion(response?.body.id);
        verifyLineChart({
          xAxis: breakoutName + ": Month",
          yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });
        verifyNoQuestionError();
      });
    });

    it("should create filter and CC with offset aggregation and sort correctly", () => {
      H.openTable({ table: ORDERS_ID });

      H.openNotebook();

      H.summarize({ mode: "notebook" });
      addCustomAggregation({
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isOpened: true,
      });

      H.addSummaryGroupingField({ field: "Created At" });
      H.addSummaryGroupingField({
        table: "Product",
        field: "Category",
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByLabelText("Custom column").last().click();

      H.enterCustomColumnDetails({
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] * 2`,
        name: `${OFFSET_SUM_TOTAL_AGGREGATION_NAME} * 2`,
      });
      H.popover().findByText("Done").click();

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("action-buttons").last().icon("filter").click();
      H.popover().findByText("Custom Expression").click();

      H.enterCustomColumnDetails({
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] > 1000`,
      });
      H.popover().findByText("Done").click();

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("action-buttons").last().icon("sort").click();
      H.popover().findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME).click();
      H.getNotebookStep("sort", { stage: 1, index: 0 })
        .findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME)
        .click();

      H.visualize();

      verifyTableContent([
        ["April 2028", "Gadget", "15,713", "31,426.01"],
        ["September 2028", "Gadget", "15,017.31", "30,034.62"],
      ]);
      verifyNoQuestionError();
    });
  });

  it("should work with metrics (metabase#47854)", () => {
    const metricName = "Count of orders";
    const ORDERS_SCALAR_METRIC: StructuredQuestionDetails = {
      name: metricName,
      type: "metric",
      description: "A metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      display: "scalar",
    };

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.createQuestion(
        {
          name: "Question with metric",
          type: "question",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["metric", metric.id]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
          },
          display: "line",
        },
        { visitQuestion: true },
      );
    });

    H.openNotebook();

    addCustomAggregation({
      formula: `Offset([${metricName}], -1)`,
      name: "Count of orders (previous month)",
    });

    H.visualize();

    H.echartsContainer().within(() => {
      cy.contains("April 2027").should("be.visible");
    });
    verifyLineChart({
      xAxis: "Created At: Month",
      legendItems: [metricName, "Count of orders (previous month)"],
    });
  });
});

function addCustomAggregation({
  formula,
  name,
  isFirst,
  isOpened,
}: {
  formula: string;
  name: string;
  isFirst?: boolean;
  isOpened?: boolean;
}) {
  if (!isOpened) {
    if (isFirst) {
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
    } else {
      H.getNotebookStep("summarize").icon("add").first().click();
    }
  }

  H.popover().findByText("Custom Expression").click();
  H.enterCustomColumnDetails({ formula, name });
  H.popover().button("Done").click();
}

function addBreakout(name: string) {
  H.getNotebookStep("summarize")
    .findByText("Pick a column to group by")
    .click();
  H.popover().findByText(name).click();
}

function saveQuestion() {
  cy.button("Save").click();
  H.modal().button("Save").click();
  return cy.wait("@saveQuestion");
}

function verifyLineChart({
  xAxis,
  yAxis,
  legendItems,
}: {
  xAxis: string;
  yAxis?: string;
  legendItems?: string[];
}) {
  H.echartsContainer().within(() => {
    cy.findByText(xAxis).should("be.visible");

    if (yAxis) {
      cy.findByText(yAxis).should("be.visible");
    }
  });

  if (legendItems) {
    for (const legendItem of legendItems) {
      cy.findAllByTestId("legend-item").contains(legendItem).should("exist");
    }
  }
}

function verifyTableContent(dataRows: string[][]) {
  const columnsCount = dataRows[0].length;
  const pairs = dataRows.flatMap((row, rowIndex) => {
    return row.map((text, cellIndex) => {
      const index = rowIndex * columnsCount + cellIndex;
      return { index, text };
    });
  });

  for (const { index, text } of pairs) {
    verifyTableCellContent(index, text);
  }
}

function verifyTableCellContent(index: number, text: string) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.tableInteractiveBody()
    .findByTestId("center-center-quadrant")
    .findAllByRole("gridcell")
    .eq(index)
    .should("have.text", text);
}

function verifyNoQuestionError() {
  cy.findByTestId("query-builder-main").within(() => {
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByText("Show error details").should("not.exist");
  });
}

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": uuid(),
    name,
    "display-name": name,
  };
}
