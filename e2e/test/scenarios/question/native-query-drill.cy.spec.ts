import {
  type NativeQuestionDetails,
  assertQueryBuilderRowCount,
  assertTableData,
  createNativeQuestion,
  echartsContainer,
  popover,
  restore,
  tableHeaderClick,
  visitQuestion,
} from "e2e/support/helpers";

const ordersQuestionDetails: NativeQuestionDetails = {
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
};

describe("scenarios > question > native query drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("drills", () => {
    beforeEach(() => {
      createNativeQuestion(ordersQuestionDetails, { wrapId: true });
    });

    it("column-filter drill", () => {
      visitQuestion("@questionId");
      assertQueryBuilderRowCount(10);
      tableHeaderClick("QUANTITY");
      popover().findByText("Filter by this column").click();
      popover().within(() => {
        cy.findByPlaceholderText("Min").type("2");
        cy.findByPlaceholderText("Max").type("5");
        cy.button("Add filter").click();
      });
      assertQueryBuilderRowCount(8);
    });

    it("distribution drill", () => {
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Distribution").click();
      echartsContainer().within(() => {
        cy.findByText("Count").should("be.visible");
        cy.findByText("QUANTITY").should("be.visible");
      });
      assertQueryBuilderRowCount(5);
    });

    it("sort drill", () => {
      cy.log("ascending");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_up").click();
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["1", "February 11, 2025, 9:40 PM", "2"]],
      });

      cy.log("descending");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_down").click();
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["8", "June 17, 2025, 2:37 AM", "7"]],
      });
    });

    it("summarize drill", () => {
      cy.log("distinct values");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Distinct values").click();
      assertTableData({
        columns: ["Distinct values of QUANTITY"],
        firstRows: [["5"]],
      });

      cy.log("sum");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Sum").click();
      assertTableData({
        columns: ["Sum of QUANTITY"],
        firstRows: [["38"]],
      });

      cy.log("avg");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Avg").click();
      assertTableData({
        columns: ["Average of QUANTITY"],
        firstRows: [["3.8"]],
      });
    });

    it("summarize-column-by-time drill", () => {
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Sum over time").click();
      assertTableData({
        columns: ["CREATED_AT: Month", "Sum of QUANTITY"],
        firstRows: [
          ["May 2023", "3"],
          ["May 2024", "3"],
          ["September 2024", "5"],
        ],
      });
    });
  });
});
