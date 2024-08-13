import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  startNewQuestion,
  type StructuredQuestionDetails,
  tableInteractiveBody,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const breakoutQuestionDetails: StructuredQuestionDetails = {
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  visualization_settings: {
    "table.pivot": false,
  },
};

describe("scenarios > question > multiple column breakouts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("notebook", () => {
    it("should allow to create a query with multiple breakouts", () => {
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      getNotebookStep("summarize")
        .findByText("Pick the metric you want to see")
        .click();
      popover().findByText("Count of rows").click();
      getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      popover().findByText("by month").click();
      popover().last().findByText("Year").click();
      getNotebookStep("summarize")
        .findByTestId("breakout-step")
        .icon("add")
        .click();
      popover().findByText("by month").click();
      popover().last().findByText("Month").click();
      visualize();
      assertQueryBuilderRowCount(49);
    });

    it("should allow to sort by breakout columns", () => {
      createQuestion(breakoutQuestionDetails, { visitQuestion: true });
      openNotebook();
      getNotebookStep("summarize").findByText("Sort").click();
      popover().findByText("Created At: Year").click();
      getNotebookStep("sort").button("Change direction").click();
      getNotebookStep("sort").icon("add").click();
      popover().findByText("Created At: Month").click();
      visualize();
      tableInteractiveBody().within(() => {
        cy.findAllByTestId("cell-data").eq(0).should("have.text", "2026");
        cy.findAllByTestId("cell-data")
          .eq(1)
          .should("have.text", "January 2026");
      });
    });
  });
});
