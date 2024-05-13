import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  openNotebook,
  popover,
  restore,
  startNewQuestion,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";
import { uuid } from "metabase/lib/uuid";
import type {
  Aggregation,
  Breakout,
  FieldReference,
  StructuredQuery,
} from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const PRODUCTS_CATEGORY_BREAKOUT: Breakout = [
  "field",
  PRODUCTS.CATEGORY,
  { "base-type": "type/text", "source-field": ORDERS.PRODUCT_ID },
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
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("does not work without a breakout", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyQuestionError(
      "Window function requires either breakouts or order by in the query",
    );
  });

  it("works with a single breakout", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT],
      limit: 5,
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    verifyTableContent([
      ["April 2022", ""],
      ["May 2022", "52.76"],
    ]);
  });

  it("works with a single breakout and sorting by breakout", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT],
      limit: 5,
      "order-by": [["desc", ORDERS_CREATED_AT_BREAKOUT]],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    verifyTableContent([
      ["April 2026", "45,683.68"],
      ["March 2026", "47,403.97"],
    ]);
  });

  it.skip("works with a single breakout and sorting by aggregation", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT],
      limit: 5,
      "order-by": [["desc", ["aggregation", 0]]],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    /* TODO: assert actual values */
    // verifyTableContent([[]]);
  });

  it("works with multiple breakouts", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    verifyTableContent([
      ["April 2022", "", "", "", ""],
      ["May 2022", "", "52.76", "", ""],
      ["June 2022", "339.14", "203.57", "493.51", "229.5"],
    ]);
  });

  it.skip("works with multiple breakouts and a limit (metabase#42509)", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
      limit: 5,
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    verifyTableContent([
      ["April 2022", "", "", "", ""],
      ["May 2022", "", "52.76", "", ""],
      ["June 2022", "339.14", "203.57", "493.51", "229.5"],
    ]);
  });

  it("works with multiple aggregations and breakouts", () => {
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [SUM_TOTAL_AGGREGATION, OFFSET_SUM_TOTAL_AGGREGATION],
      breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
      limit: 9,
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyNoQuestionError();
    verifyTableContent([
      ["April 2022", "Gadget", "52.76", ""],
      ["May 2022", "Doohickey", "339.14", ""],
      ["May 2022", "Gadget", "203.57", "52.76"],
      ["May 2022", "Gizmo", "493.51", ""],
      ["May 2022", "Widget", "229.5", ""],
      ["June 2022", "Doohickey", "482.56", "339.14"],
      ["June 2022", "Gadget", "515.53", "203.57"],
      ["June 2022", "Gizmo", "387.79", "493.51"],
      ["June 2022", "Widget", "687.06", "229.5"],
    ]);
  });

  it("works after saving a question (metabase#42323)", () => {
    const breakoutName = "Created At";

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
    });
    addBreakout(breakoutName);

    visualize();
    verifyNoQuestionError();
    verifyLineChart({
      xAxis: breakoutName,
      yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
    });

    saveQuestion().then(({ response }) => {
      visitQuestion(response?.body.id);
      verifyNoQuestionError();
      verifyLineChart({
        xAxis: breakoutName,
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });
    });
  });

  it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
    const formula = "Sum(case([Total] > 0, Offset([Total], -1)))";
    const name = "Aggregation";
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
    };

    createQuestion({ query }, { visitQuestion: true });
    openNotebook();
    cy.icon("sum").click();
    addCustomAggregation({ formula, name });

    cy.on("uncaught:exception", error => {
      expect(error.message.includes("Error normalizing")).not.to.be.true;
    });
  });
});

function addCustomAggregation({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  getNotebookStep("summarize")
    .findByText("Pick the metric you want to see")
    .click();
  popover().contains("Custom Expression").click();
  enterCustomColumnDetails({ formula, name });
  popover().button("Done").click();
}

function addBreakout(name: string) {
  getNotebookStep("summarize").findByText("Pick a column to group by").click();
  popover().findByText(name).click();
}

function saveQuestion() {
  cy.button("Save").click();
  modal().button("Save").click();
  return cy.wait("@saveQuestion");
}

function verifyLineChart({ xAxis, yAxis }: { xAxis: string; yAxis: string }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}

function verifyTableContent(rows: string[][]) {
  const columnsCount = rows[0].length;
  const pairs = rows.flatMap((row, rowIndex) => {
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
  cy.findAllByRole("gridcell").eq(index).should("have.text", text);
}

function verifyQuestionError(error: string) {
  cy.findByTestId("query-builder-main").within(() => {
    cy.findByText("There was a problem with your question").should("exist");
    cy.findByText("Show error details").click();
    cy.findByText(error).should("exist");
  });
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
