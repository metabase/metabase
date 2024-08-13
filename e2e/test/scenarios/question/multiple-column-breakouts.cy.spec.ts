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
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const breakoutQuestionDetails: StructuredQuestionDetails = {
  query: {
    "source-table": ORDERS_ID,
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month-of-year" },
      ],
    ],
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
      popover()
        .last()
        .within(() => {
          cy.findByText("More…").click();
          cy.findByText("Month of year").click();
        });
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
      popover().findByText("Created At: Month of year").click();
      visualize();
    });
  });
});
