import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  type NativeQuestionDetails,
  assertQueryBuilderRowCount,
  assertTableData,
  cartesianChartCircle,
  createNativeQuestion,
  echartsContainer,
  getDashboardCard,
  modal,
  popover,
  restore,
  tableHeaderClick,
  tableInteractive,
  visitDashboard,
  visitQuestion,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const ordersTableQuestionDetails: NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
};

const peopleTableQuestionDetails: NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, EMAIL, CREATED_AT FROM PEOPLE ORDER BY ID LIMIT 10",
  },
};

const dateChartQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["QUANTITY"],
  },
};

const numericChartQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["ID"],
    "graph.metrics": ["QUANTITY"],
  },
};

describe("scenarios > question > native query drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveCard");
  });

  describe("query builder metadata", () => {
    it("should allow to save an ad-hoc native query when attempting to drill", () => {
      visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: peopleTableQuestionDetails.native,
        },
      });
      cy.wait("@dataset");

      tableInteractive().findByText("October 7, 2023, 1:34 AM").click();
      popover().within(() => {
        cy.findByText("Filter by this date").should("not.exist");
        cy.button("Save").click();
      });
      modal().within(() => {
        cy.findByLabelText("Name").type("SQL");
        cy.button("Save").click();
        cy.wait("@saveCard");
      });
      modal().findByText("Not now").click();

      tableInteractive().findByText("October 7, 2023, 1:34 AM").click();
      popover().within(() => {
        cy.findByText("Filter by this date").should("be.visible");
        cy.findByText("On").click();
      });
      cy.wait("@dataset");
      assertQueryBuilderRowCount(1);
    });
  });

  describe("query builder drills", () => {
    it("column-extract drill", () => {
      cy.log("from column header");
      createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("CREATED_AT");
      popover().within(() => {
        cy.findByText("Extract day, month…").click();
        cy.findByText("Quarter of year").click();
        cy.wait("@dataset");
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
        cy.wait("@dataset");
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
      createNativeQuestion(peopleTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("EMAIL");
      popover().findByText("Combine columns").click();
      popover().button("Done").click();
      cy.wait("@dataset");
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
      cy.wait("@dataset");
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
      createNativeQuestion(ordersTableQuestionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(10);
      tableHeaderClick("QUANTITY");
      popover().findByText("Filter by this column").click();
      popover().within(() => {
        cy.findByPlaceholderText("Min").type("2");
        cy.findByPlaceholderText("Max").type("5");
        cy.button("Add filter").click();
        cy.wait("@dataset");
      });
      assertQueryBuilderRowCount(8);
    });

    it("distribution drill", () => {
      createNativeQuestion(ordersTableQuestionDetails, { visitQuestion: true });
      tableHeaderClick("QUANTITY");
      popover().findByText("Distribution").click();
      cy.wait("@dataset");
      echartsContainer().within(() => {
        cy.findByText("Count").should("be.visible");
        cy.findByText("QUANTITY").should("be.visible");
      });
      assertQueryBuilderRowCount(5);
    });

    it("quick-filter drill", () => {
      createNativeQuestion(dateChartQuestionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(10);
      cartesianChartCircle().eq(0).click();
      popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.findByText("=").click();
        cy.wait("@dataset");
      });
      assertQueryBuilderRowCount(3);
    });

    it("sort drill", () => {
      cy.log("ascending");
      createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_up").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["1", "February 11, 2025, 9:40 PM", "2"]],
      });

      cy.log("descending");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().icon("arrow_down").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["8", "June 17, 2025, 2:37 AM", "7"]],
      });
    });

    it("summarize drill", () => {
      cy.log("distinct values");
      createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      tableHeaderClick("QUANTITY");
      popover().findByText("Distinct values").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["Distinct values of QUANTITY"],
        firstRows: [["5"]],
      });

      cy.log("sum");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Sum").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["Sum of QUANTITY"],
        firstRows: [["38"]],
      });

      cy.log("avg");
      visitQuestion("@questionId");
      tableHeaderClick("QUANTITY");
      popover().findByText("Avg").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["Average of QUANTITY"],
        firstRows: [["3.8"]],
      });
    });

    it("summarize-column-by-time drill", () => {
      createNativeQuestion(ordersTableQuestionDetails, { visitQuestion: true });
      tableHeaderClick("QUANTITY");
      popover().findByText("Sum over time").click();
      cy.wait("@dataset");
      assertTableData({
        columns: ["CREATED_AT: Month", "Sum of QUANTITY"],
        firstRows: [
          ["May 2023", "3"],
          ["May 2024", "3"],
          ["September 2024", "5"],
        ],
      });
    });

    it("unsupported drills", () => {
      createNativeQuestion(dateChartQuestionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(10);
      cartesianChartCircle().eq(0).click();
      popover().within(() => {
        cy.findByText(/See these/).should("not.exist");
        cy.findByText(/Breakout by/).should("not.exist");
        cy.findByText(/Automatic insights/).should("not.exist");
      });
    });
  });

  describe("query builder brush filters", () => {
    it("timeseries filter", () => {
      createNativeQuestion(dateChartQuestionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(10);
      applyBrushFilter(200, 800);
      cy.wait("@dataset");
      assertQueryBuilderRowCount(3);
    });

    it("numeric filter", () => {
      createNativeQuestion(numericChartQuestionDetails, {
        visitQuestion: true,
      });
      assertQueryBuilderRowCount(10);
      applyBrushFilter(200, 800);
      cy.wait("@dataset");
      assertQueryBuilderRowCount(5);
    });
  });

  describe("dashboard drills", () => {
    it("quick-filter drill", () => {
      cy.log("from a cell");
      cy.createDashboardWithQuestions({
        questions: [ordersTableQuestionDetails],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      getDashboardCard().findByText("May 15, 2024, 8:04 AM").click();
      popover().within(() => {
        cy.findByText("Filter by this date").should("be.visible");
        cy.findByText("On").click();
        cy.wait("@dataset");
      });
      assertQueryBuilderRowCount(1);

      cy.log("from a chart dot");
      cy.createDashboardWithQuestions({
        questions: [dateChartQuestionDetails],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      getDashboardCard().within(() => cartesianChartCircle().eq(0).click());
      popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.findByText("=").click();
        cy.wait("@dataset");
      });
      assertQueryBuilderRowCount(3);
    });
  });

  describe("dashboard brush filters", () => {
    it("timeseries filter", () => {});

    it("numeric filter", () => {});
  });
});

function applyBrushFilter(fromX: number, toX: number) {
  echartsContainer()
    .trigger("mousedown", fromX, 200)
    .trigger("mousemove", fromX, 200)
    .trigger("mouseup", toX, 200);
}
