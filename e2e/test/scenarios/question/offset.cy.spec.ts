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

const ORDERS_ID_FIELD_REF: FieldReference = [
  "field",
  ORDERS.ID,
  { "base-type": "type/BigInteger" },
];

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

  describe("custom columns", () => {
    // This test contradicts the next 2 skipped ones.
    // Remove it once we enable offset() in custom columns.
    it("does not suggest or allow using offset()", () => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
        limit: 5,
        "order-by": [["asc", ORDERS_TOTAL_FIELD_REF]],
      };

      H.createQuestion({ query }, { visitQuestion: true });
      H.openNotebook();
      cy.button("Custom column").click();
      H.enterCustomColumnDetails({ formula: prefix });

      cy.log("does not suggest offset() in custom columns");
      H.CustomExpressionEditor.completions().should("not.exist");

      H.enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      H.expressionEditorWidget().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom columns").should(
          "exist",
        );
      });
    });

    // Skipped because we want to disable offset() in custom columns for now
    it("suggests and allows using offset()", { tags: "@skip" }, () => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });
      H.openNotebook();
      cy.button("Custom column").click();
      H.enterCustomColumnDetails({ formula: prefix });

      cy.log("suggests offset() in custom column expressions");
      cy.findByTestId("expression-suggestions-list-item")
        .should("exist")
        .and("have.text", "Offset");

      H.enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      H.popover().within(() => {
        cy.findByText("OFFSET in a custom expression requires a sort order");
        cy.button("Done").should("be.disabled");
        cy.button("Cancel").click();
      });

      cy.button("Sort").click();
      H.popover().findByText("ID").click();
      H.getNotebookStep("expression").icon("add").click();
      H.enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      H.popover().within(() => {
        cy.button("Done").should("be.disabled");

        cy.findByPlaceholderText("Something nice and descriptive")
          .type("My expression")
          .blur();

        cy.button("Done").should("be.enabled").click();
      });

      cy.log("preview availability");
      H.getNotebookStep("data").icon("play").should("be.visible");
      H.getNotebookStep("expression").icon("play").should("not.be.visible");
      H.getNotebookStep("sort").icon("play").should("be.visible");
      H.getNotebookStep("limit").icon("play").should("be.visible");

      H.visualize();
      verifyTableContent([
        ["1", "39.72", ""],
        ["2", "117.03", "39.72"],
        ["3", "49.21", "117.03"],
      ]);
    });

    // Skipped because we want to disable offset() in custom columns for now
    it(
      "does not allow to use offset-based column in other clauses (metabase#42764)",
      { tags: "@skip" },
      () => {
        const offsettedColumnName = "xyz";
        const expression = `Offset([${offsettedColumnName}], -1)`;
        const prefixLength = "Offset([x".length;
        const prefix = expression.substring(0, prefixLength);
        const query: StructuredQuery = {
          "source-table": ORDERS_ID,
          expressions: {
            [offsettedColumnName]: [
              "offset",
              createOffsetOptions(offsettedColumnName),
              ORDERS_TOTAL_FIELD_REF,
              -1,
            ],
          },
          "order-by": [["asc", ORDERS_ID_FIELD_REF]],
          limit: 5,
        };

        H.createQuestion({ query }, { visitQuestion: true });

        cy.log("custom column drills");
        const rowIndex = 1;
        const columnIndex = 9;
        const columnsCount = 10;
        const cellIndex = rowIndex * columnsCount + columnIndex;
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.findAllByRole("gridcell").eq(cellIndex).click();
        cy.get(H.POPOVER_ELEMENT).should("not.exist");

        H.openNotebook();

        cy.log("custom column expressions");
        H.getNotebookStep("expression").icon("add").click();
        verifyInvalidColumnName(offsettedColumnName, prefix, expression);
        H.popover().button("Cancel").click();

        cy.log("custom filter expressions");
        cy.icon("filter").click();
        H.popover().findByText("Custom Expression").click();
        verifyInvalidColumnName(offsettedColumnName, prefix, expression);
        H.popover().button("Cancel").click();
        cy.realPress("Escape");

        cy.log("custom aggregation expressions");
        cy.icon("sum").click();
        H.popover().findByText("Custom Expression").click();
        verifyInvalidColumnName(offsettedColumnName, prefix, expression);
        H.popover().button("Cancel").click();
        cy.realPress("Escape");

        cy.log("sort clause");
        H.getNotebookStep("sort").icon("add").click();
        H.popover().should("not.contain", offsettedColumnName);
      },
    );
  });

  describe("filters", () => {
    it("does not suggest or allow using offset()", () => {
      const expression = "Offset([Total], -1) > 0";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });
      H.openNotebook();
      cy.button("Filter").click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: prefix });

      cy.log("does not suggest offset() in filter expressions");
      H.CustomExpressionEditor.completions().should("not.exist");

      H.enterCustomColumnDetails({ formula: expression });
      cy.realPress("Tab");

      H.expressionEditorWidget().within(() => {
        cy.button("Done").should("be.disabled");
        cy.findByText("OFFSET is not supported in custom filters").should(
          "exist",
        );
      });
    });
  });

  describe("aggregations", () => {
    it("suggests and allows using offset()", () => {
      const expression = "Offset(Sum([Total]), -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);
      const query: StructuredQuery = {
        "source-table": ORDERS_ID,
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });
      H.openNotebook();
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

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2025", ""],
        ["May 2025", "52.76"],
      ]);

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
      verifyNoQuestionError();
      verifyLineChart({
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });

      saveQuestion().then(({ response }) => {
        H.visitQuestion(response?.body.id);
        verifyNoQuestionError();
        verifyLineChart({
          xAxis: breakoutName + ": Month",
          yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        });
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

      verifyNoQuestionError();
      verifyTableContent([
        ["April 2028", "Gadget", "15,713", "31,426.01"],
        ["September 2028", "Gadget", "15,017.31", "30,034.62"],
      ]);
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
      cy.contains("January 2027").should("be.visible");
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
    cy.log("index", index);
    cy.log("text", text);
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

function verifyInvalidColumnName(
  columnName: string,
  prefix: string,
  expression: string,
) {
  H.enterCustomColumnDetails({ formula: prefix });
  cy.findByTestId("expression-suggestions-list-item").should("not.exist");

  H.enterCustomColumnDetails({ formula: expression });
  cy.realPress("Tab");
  H.popover().within(() => {
    cy.findByText(`Unknown Field: ${columnName}`).should("be.visible");
    cy.button("Done").should("be.disabled");
  });
}

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": uuid(),
    name,
    "display-name": name,
  };
}
