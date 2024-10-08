import {
  type NativeQuestionDetails,
  assertTableData,
  createNativeQuestion,
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
