import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  getNotebookStep,
  modal,
  openNotebook,
  popover,
  queryBuilderHeader,
  restore,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const PIVOT_QUESTION = {
  display: "pivot",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
    ],
    breakout: [
      [
        "field",
        PEOPLE.STATE,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
    ],
  },
  visualization_settings: {
    "pivot_table.column_split": {
      rows: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "year" },
        ],
      ],
      columns: [
        [
          "field",
          PEOPLE.STATE,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
      ],
      values: [
        ["aggregation", 0],
        ["aggregation", 1],
      ],
    },
    "pivot_table.column_widths": {
      leftHeaderWidths: [156],
      totalLeftHeaderWidths: 156,
      valueHeaderWidths: {},
    },
  },
};

describe("issue 42697", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should display a pivot table when a new breakout is added to the query (metabase#42697)", () => {
    createQuestion(PIVOT_QUESTION, { visitQuestion: true });
    openNotebook();
    getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    queryBuilderHeader().findByText("Save").click();
    modal().button("Save").click();
    cy.wait("@updateCard");
    cy.button("Visualize").click();
    cy.findByTestId("pivot-table")
      .findByText("Product → Category")
      .should("be.visible");
  });
});
