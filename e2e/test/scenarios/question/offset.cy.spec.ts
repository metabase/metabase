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

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "api/dataset").as("dataset");
  });

  it("does not work without breakout or order-by clause", () => {
    const aggregation: Aggregation = [
      "offset",
      createOffsetOptions(),
      ["sum", ORDERS_TOTAL_FIELD_REF],
      -1,
    ];
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [aggregation],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyQuestionError(
      "Window function requires either breakouts or order by in the query",
    );
  });

  it("works with breakout clause", () => {
    const aggregationName = "My aggregation";
    const aggregation: Aggregation = [
      "offset",
      createOffsetOptions(aggregationName),
      ["sum", ORDERS_TOTAL_FIELD_REF],
      -1,
    ];
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [aggregation],
      breakout: [ORDERS_CREATED_AT_BREAKOUT],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyTableContent([
      ["April 2022", ""],
      ["May 2022", "52.76"],
    ]);
  });

  it("works with multiple breakout clauses", () => {
    const aggregation: Aggregation = [
      "offset",
      createOffsetOptions(),
      ["sum", ORDERS_TOTAL_FIELD_REF],
      -1,
    ];
    const query: StructuredQuery = {
      "source-table": ORDERS_ID,
      aggregation: [aggregation],
      breakout: [ORDERS_CREATED_AT_BREAKOUT, PRODUCTS_CATEGORY_BREAKOUT],
    };

    createQuestion({ query }, { visitQuestion: true });

    verifyTableContent([
      ["April 2022", "", "", "", ""],
      ["May 2022", "", "52.76", "", ""],
      ["June 2022", "339.14", "203.57", "493.51", "229.5"],
    ]);
  });

  it("works after saving a question (metabase#42323)", () => {
    const aggregationName = "Total sum with offset";
    const breakoutName = "Created At";

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: aggregationName,
    });
    addBreakout(breakoutName);

    visualize();
    verifyLineChart({ xAxis: breakoutName, yAxis: aggregationName });

    saveQuestion().then(({ response }) => {
      visitQuestion(response?.body.id);
      verifyLineChart({ xAxis: breakoutName, yAxis: aggregationName });
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

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": uuid(),
    name,
    "display-name": name,
  };
}

let nextUuid = 0;

function uuid() {
  const uuids = "0123456789abcdef".split("").map(character => {
    return `355c4922-b77c-43b5-9787-46918e11217${character}`;
  });

  return uuids[++nextUuid % uuids.length];
}
