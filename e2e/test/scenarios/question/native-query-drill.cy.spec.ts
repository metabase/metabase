import {
  type NativeQuestionDetails,
  assertTableData,
  createNativeQuestion,
  popover,
  restore,
  tableHeaderClick,
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
    it("sort drill", () => {
      cy.log("ascending");
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_up").click();
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["1", "February 11, 2025, 9:40 PM", "2"]],
      });

      cy.log("descending");
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_down").click();
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["8", "June 17, 2025, 2:37 AM", "7"]],
      });
    });
  });
});
