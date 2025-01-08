import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const ordersTableQuestionDetails: H.NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
};

const peopleTableQuestionDetails: H.NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, EMAIL, CREATED_AT FROM PEOPLE ORDER BY ID LIMIT 10",
  },
};

const timeseriesLineQuestionDetails: H.NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["QUANTITY"],
  },
};

const timeseriesWithCategoryLineQuestionDetails: H.NativeQuestionDetails = {
  display: "line",
  native: {
    query:
      "SELECT PRICE, CATEGORY, CREATED_AT FROM PRODUCTS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["PRICE"],
  },
};

const numericLineQuestionDetails: H.NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT ID, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["ID"],
    "graph.metrics": ["QUANTITY"],
  },
};

const pinMapQuestionDetails: H.NativeQuestionDetails = {
  display: "map",
  native: {
    query: "SELECT LATITUDE, LONGITUDE FROM PEOPLE ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "map.type": "pin",
    "map.longitude_column": "LONGITUDE",
    "map.latitude_column": "LATITUDE",
  },
};

const gridMapQuestionDetails: H.NativeQuestionDetails = {
  display: "map",
  native: {
    query: "SELECT LATITUDE, LONGITUDE FROM PEOPLE ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "map.type": "grid",
    "map.longitude_column": "LONGITUDE",
    "map.latitude_column": "LATITUDE",
  },
};

describe("scenarios > question > native query drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveCard");
  });

  describe("query builder metadata", () => {
    it("should allow to save an ad-hoc native query when attempting to drill", () => {
      H.visitQuestionAdhoc({
        display: "table",
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: peopleTableQuestionDetails.native,
        },
      });
      cy.wait("@dataset");

      H.tableInteractive().findByText("October 7, 2023, 1:34 AM").click();
      H.popover().within(() => {
        cy.findByText("Filter by this date and time").should("not.exist");
        cy.button("Save").click();
      });
      H.modal().within(() => {
        cy.findByLabelText("Name").type("SQL");
        cy.button("Save").click();
        cy.wait("@saveCard");
      });
      H.modal().findByText("Not now").click();

      H.tableInteractive().findByText("October 7, 2023, 1:34 AM").click();
      H.popover().within(() => {
        cy.findByText("Filter by this date and time").should("be.visible");
        cy.findByText("On").click();
      });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(1);
    });
  });

  describe("query builder drills", () => {
    it("column-extract drill", () => {
      cy.log("from column header");
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      H.tableHeaderClick("CREATED_AT");
      H.popover().within(() => {
        cy.findByText("Extract day, month…").click();
        cy.findByText("Quarter of year").click();
        cy.wait("@dataset");
      });
      H.assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2025, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2024, 8:04 AM", "3", "Q2"],
        ],
      });

      cy.log("from plus button");
      H.visitQuestion("@questionId");
      H.tableInteractive().button("Add column").click();
      H.popover().within(() => {
        cy.findByText("Extract part of column").click();
        cy.findByText("CREATED_AT").click();
        cy.findByText("Quarter of year").click();
        cy.wait("@dataset");
      });
      H.assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2025, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2024, 8:04 AM", "3", "Q2"],
        ],
      });
    });

    it("combine-columns drill", () => {
      cy.log("from column header");
      H.createNativeQuestion(peopleTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      H.tableHeaderClick("EMAIL");
      H.popover().findByText("Combine columns").click();
      H.popover().button("Done").click();
      cy.wait("@dataset");
      H.assertTableData({
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
      H.visitQuestion("@questionId");
      H.tableInteractive().button("Add column").click();
      H.popover().findByText("Combine columns").click();
      H.popover().button("Done").click();
      cy.wait("@dataset");
      H.assertTableData({
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
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Filter by this column").click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Min").type("2");
        cy.findByPlaceholderText("Max").type("5");
        cy.button("Add filter").click();
        cy.wait("@dataset");
      });
      H.assertQueryBuilderRowCount(8);
    });

    it("distribution drill", () => {
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
      });
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Distribution").click();
      cy.wait("@dataset");
      H.echartsContainer().within(() => {
        cy.findByText("Count").should("be.visible");
        cy.findByText("QUANTITY: 8 bins").should("be.visible");
      });
      H.assertQueryBuilderRowCount(5);
    });

    it("quick-filter drill", () => {
      H.createNativeQuestion(timeseriesLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      H.cartesianChartCircle().eq(0).click();
      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.findByText("=").click();
        cy.wait("@dataset");
      });
      H.assertQueryBuilderRowCount(3);
    });

    it("sort drill", () => {
      cy.log("ascending");
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      H.tableHeaderClick("QUANTITY");
      H.popover().icon("arrow_up").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["1", "February 11, 2025, 9:40 PM", "2"]],
      });

      cy.log("descending");
      H.visitQuestion("@questionId");
      H.tableHeaderClick("QUANTITY");
      H.popover().icon("arrow_down").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["8", "June 17, 2025, 2:37 AM", "7"]],
      });
    });

    it("summarize drill", () => {
      cy.log("distinct values");
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
        wrapId: true,
      });
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Distinct values").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["Distinct values of QUANTITY"],
        firstRows: [["5"]],
      });

      cy.log("sum");
      H.visitQuestion("@questionId");
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Sum").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["Sum of QUANTITY"],
        firstRows: [["38"]],
      });

      cy.log("avg");
      H.visitQuestion("@questionId");
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Avg").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["Average of QUANTITY"],
        firstRows: [["3.8"]],
      });
    });

    it("summarize-column-by-time drill", () => {
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
      });
      H.tableHeaderClick("QUANTITY");
      H.popover().findByText("Sum over time").click();
      cy.wait("@dataset");
      H.assertTableData({
        columns: ["CREATED_AT: Month", "Sum of QUANTITY"],
        firstRows: [
          ["May 2023", "3"],
          ["May 2024", "3"],
          ["September 2024", "5"],
        ],
      });
    });

    it("unsupported drills", () => {
      cy.log("aggregated cell click");
      H.createNativeQuestion(timeseriesLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      H.cartesianChartCircle().eq(0).click();
      H.popover().within(() => {
        cy.findByText(/See these/).should("not.exist");
        cy.findByText(/Breakout by/).should("not.exist");
        cy.findByText(/Automatic insights/).should("not.exist");
      });

      cy.log("legend item click");
      H.createNativeQuestion(timeseriesWithCategoryLineQuestionDetails, {
        visitQuestion: true,
      });
      cy.findByTestId("visualization-root").findByText("Gadget").click();
      cy.findByRole("tooltip").should("not.exist");
    });
  });

  describe("query builder brush filters", () => {
    it("timeseries filter", () => {
      H.createNativeQuestion(timeseriesLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      applyBrushFilter({ left: 200, right: 800 });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(4);
    });

    it("numeric filter", () => {
      H.createNativeQuestion(numericLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      applyBrushFilter({ left: 200, right: 800 });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(5);
    });

    it("coordinates filter", () => {
      cy.log("pin map");
      H.createNativeQuestion(pinMapQuestionDetails, { visitQuestion: true });
      cy.findByTestId("visualization-root").realHover();
      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("Save as default view").should("be.visible");
        cy.findByText("Draw box to filter").click();
      });
      applyBoxFilter({
        top: 100,
        left: 100,
        right: 500,
        bottom: 500,
      });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(1);

      cy.log("grid map");
      H.createNativeQuestion(gridMapQuestionDetails, { visitQuestion: true });
      cy.findByTestId("visualization-root").realHover();
      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("Save as default view").should("be.visible");
        cy.findByText("Draw box to filter").should("not.exist");
      });
    });
  });

  describe("dashboard drills", () => {
    it("quick-filter drill", () => {
      cy.log("cell click");
      H.createNativeQuestionAndDashboard({
        questionDetails: ordersTableQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().findByText("May 15, 2024, 8:04 AM").click();
      H.popover().within(() => {
        cy.findByText("Filter by this date and time").should("be.visible");
        cy.findByText("On").click();
        cy.wait("@dataset");
      });
      H.assertQueryBuilderRowCount(1);

      cy.log("aggregated cell click");
      H.createNativeQuestionAndDashboard({
        questionDetails: timeseriesLineQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().within(() => H.cartesianChartCircle().eq(0).click());
      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.findByText("=").click();
        cy.wait("@dataset");
      });
      H.assertQueryBuilderRowCount(3);
    });
  });

  describe("dashboard brush filters", () => {
    it("timeseries filter", () => {
      H.createNativeQuestionAndDashboard({
        questionDetails: timeseriesLineQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().within(() =>
        applyBrushFilter({ left: 100, right: 300 }),
      );
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(4);
    });

    it("numeric filter", () => {
      H.createNativeQuestionAndDashboard({
        questionDetails: numericLineQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().within(() =>
        applyBrushFilter({ left: 100, right: 300 }),
      );
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(5);
    });
  });
});

function applyBrushFilter({ left, right }: { left: number; right: number }) {
  H.ensureEchartsContainerHasSvg();
  cy.wait(100); // wait to avoid grabbing the svg before the chart redraws

  H.echartsContainer()
    .trigger("mousedown", left, 100)
    .trigger("mousemove", left, 100)
    .trigger("mouseup", right, 100);
}

function applyBoxFilter({
  top,
  left,
  right,
  bottom,
}: {
  top: number;
  left: number;
  right: number;
  bottom: number;
}) {
  cy.wait(100); // wait to avoid grabbing the svg before the chart redraws

  cy.findByTestId("visualization-root")
    .realMouseDown({ x: left, y: top })
    .realMouseMove(right - left, bottom - top)
    .realMouseUp({ x: right, y: bottom });
}
