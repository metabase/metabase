const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";

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

const timeseriesLineQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["QUANTITY"],
  },
};

const numericLineQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT ID, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["ID"],
    "graph.metrics": ["QUANTITY"],
  },
};

const pinMapQuestionDetails: NativeQuestionDetails = {
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

      H.tableInteractive().findByText("October 7, 2026, 1:34 AM").click();
      H.popover().within(() => {
        cy.button("Save").should("be.visible");
        cy.findByText("Filter by this date and time").should("not.exist");
        cy.button("Save").click();
      });
      H.modal().within(() => {
        cy.findByLabelText("Name").type("SQL");
        cy.button("Save").click();
        cy.wait("@saveCard");
      });

      H.tableInteractive().findByText("October 7, 2026, 1:34 AM").click();
      H.popover().within(() => {
        cy.findByText("Filter by this date and time").should("be.visible");
        cy.findByText("On").click();
      });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(1);
    });
  });

  describe("query builder drills and brush filters", () => {
    it("column-extract drill", () => {
      H.createNativeQuestion(ordersTableQuestionDetails, {
        visitQuestion: true,
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
          ["1", "February 11, 2028, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2027, 8:04 AM", "3", "Q2"],
        ],
      });
    });

    it("timeseries brush filter", () => {
      H.createNativeQuestion(timeseriesLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      H.applyBrushToPoints(2, 5);
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(4);
    });

    it("numeric brush filter", () => {
      H.createNativeQuestion(numericLineQuestionDetails, {
        visitQuestion: true,
      });
      H.assertQueryBuilderRowCount(10);
      H.applyBrushToPoints(1, 6);
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(6);
    });

    it("coordinates brush filter", () => {
      H.createNativeQuestion(pinMapQuestionDetails, { visitQuestion: true });
      cy.findByTestId("visualization-root").realHover();
      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("Set as default view").should("be.visible");
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
    });
  });

  describe("dashboard drills", () => {
    it("quick-filter drill", () => {
      cy.log("cell click");
      H.createNativeQuestionAndDashboard({
        questionDetails: ordersTableQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().findByText("May 15, 2027, 8:04 AM").click();
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
        cy.findByText(/See this/).should("not.exist");
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
      H.getDashboardCard().within(() => H.applyBrushToPoints(2, 5));
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(4);
    });

    it("numeric filter", () => {
      H.createNativeQuestionAndDashboard({
        questionDetails: numericLineQuestionDetails,
      }).then(({ body }) => H.visitDashboard(body.dashboard_id));
      H.getDashboardCard().within(() => H.applyBrushToPoints(1, 6));
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(6);
    });
  });
});

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
