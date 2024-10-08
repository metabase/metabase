import {
  type NativeQuestionDetails,
  assertQueryBuilderRowCount,
  assertTableData,
  createNativeQuestion,
  echartsContainer,
  popover,
  restore,
  tableHeaderClick,
  tableInteractive,
  visitQuestion,
} from "e2e/support/helpers";

const ordersQuestionDetails: NativeQuestionDetails = {
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
};

const peopleQuestionDetails: NativeQuestionDetails = {
  native: {
    query: "SELECT ID, EMAIL, CREATED_AT FROM PEOPLE ORDER BY ID LIMIT 10",
  },
};

describe("scenarios > question > native query drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("drills", () => {
    it("column-extract drill", () => {
      cy.log("from column header");
      createNativeQuestion(ordersQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("CREATED_AT");
      popover().within(() => {
        cy.findByText("Extract day, month…").click();
        cy.findByText("Quarter of year").click();
      });
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2025, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2024, 8:04 AM", "3", "Q2"],
        ],
      });

      cy.log("from plus button");
      visitQuestion("@questionId");
      tableInteractive().button("Add column").click();
      popover().within(() => {
        cy.findByText("Extract part of column").click();
        cy.findByText("CREATED_AT").click();
        cy.findByText("Quarter of year").click();
      });
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2025, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2024, 8:04 AM", "3", "Q2"],
        ],
      });
    });

    it("combine-columns drill", () => {
      cy.log("from column header");
      createNativeQuestion(peopleQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("EMAIL");
      popover().findByText("Combine columns").click();
      popover().button("Done").click();
      assertTableData({
        columns: ["ID", "EMAIL", "CREATED_AT", "Combined EMAIL, ID"],
        firstRows: [
          [
            "1",
            "borer-hudson@yahoo.com",
            "October 7, 2023, 1:34 AM",
            "borer-hudson@yahoo.com 1",
          ],
        ],
      });

      cy.log("from plus button");
      visitQuestion("@questionId");
      tableInteractive().button("Add column").click();
      popover().findByText("Combine columns").click();
      popover().button("Done").click();
      assertTableData({
        columns: ["ID", "EMAIL", "CREATED_AT", "Combined ID, EMAIL"],
        firstRows: [
          [
            "1",
            "borer-hudson@yahoo.com",
            "October 7, 2023, 1:34 AM",
            "1 borer-hudson@yahoo.com",
          ],
        ],
      });
    });

    it("column-filter drill", () => {
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
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
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
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
      createNativeQuestion(ordersQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
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
      createNativeQuestion(ordersQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
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
      createNativeQuestion(ordersQuestionDetails, { visitQuestion: true });
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
