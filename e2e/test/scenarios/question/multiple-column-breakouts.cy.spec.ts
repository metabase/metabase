import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  popover,
  restore,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

describe("scenarios > question > multiple column breakouts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("notebook", () => {
    it("should create a query with multiple breakouts", () => {
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
  });
});
