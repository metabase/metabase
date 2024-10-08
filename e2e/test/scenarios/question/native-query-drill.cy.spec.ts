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
    query: "SELECT ID, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
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
        columns: ["ID", "QUANTITY"],
        firstRows: [["1", "1"]],
      });

      cy.log("descending");
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_down").click();
      assertTableData({
        columns: ["ID", "QUANTITY"],
        firstRows: [["8", "7"]],
      });
    });
  });
});
