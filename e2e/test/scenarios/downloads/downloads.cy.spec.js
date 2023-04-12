import {
  restore,
  downloadAndAssert,
  startNewQuestion,
  visualize,
  visitDashboard,
  popover,
  assertSheetRowsCount,
  filterWidget,
  saveDashboard,
  getDashboardCardMenu,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const testCases = ["csv", "xlsx"];

describe("scenarios > question > download", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  testCases.forEach(fileType => {
    it(`downloads ${fileType} file`, () => {
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("Orders, Count").click();

      visualize();
      cy.contains("18,760");

      downloadAndAssert({ fileType }, sheet => {
        expect(sheet["A1"].v).to.eq("Count");
        expect(sheet["A2"].v).to.eq(18760);
      });
    });
  });

  describe("from dashboards", () => {
    it("should allow downloading card data", () => {
      cy.intercept("GET", "/api/dashboard/**").as("dashboard");
      visitDashboard(1);
      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      assertOrdersExport(18760);

      cy.icon("pencil").click();

      cy.icon("filter").click();

      popover().within(() => {
        cy.contains("ID").click();
      });

      cy.get(".DashCard").contains("Select…").click();
      popover().contains("ID").eq(0).click();

      saveDashboard();

      filterWidget().contains("ID").click();

      popover().find("input").type("1");

      cy.findByText("Add filter").click();

      cy.wait("@dashboard");

      cy.findByTestId("dashcard").within(() => {
        cy.findByTestId("legend-caption").realHover();
      });

      assertOrdersExport(1);
    });
  });

  describe("png images", () => {
    const canSavePngQuestion = {
      name: "Q1",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      visualization_settings: {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT"],
      },
    };

    const cannotSavePngQuestion = {
      name: "Q2",
      display: "table",
      query: {
        "source-table": ORDERS_ID,
      },
      visualization_settings: {},
    };

    it("from dashboards", () => {
      cy.createDashboardWithQuestions({
        dashboardName: "saving pngs dashboard",
        questions: [canSavePngQuestion, cannotSavePngQuestion],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      cy.findByText("Q1").realHover();
      getDashboardCardMenu(0).click();

      popover().within(() => {
        cy.findByText("Download results").click();
        cy.findByText(".png").click();
      });

      cy.findByText("Q2").realHover();
      getDashboardCardMenu(1).click();

      popover().within(() => {
        cy.findByText("Download results").click();
        cy.findByText(".png").should("not.exist");
      });

      cy.verifyDownload(".png", { contains: true });
    });

    it("from query builder", () => {
      cy.createQuestion(canSavePngQuestion, { visitQuestion: true });

      cy.findByTestId("download-button").click();

      popover().within(() => {
        cy.findByText(".png").click();
      });

      cy.verifyDownload(".png", { contains: true });

      cy.createQuestion(cannotSavePngQuestion, { visitQuestion: true });

      cy.findByTestId("download-button").click();

      popover().within(() => {
        cy.findByText(".png").should("not.exist");
      });
    });
  });
});

function assertOrdersExport(length) {
  downloadAndAssert(
    {
      fileType: "xlsx",
      questionId: 1,
      dashcardId: 1,
      dashboardId: 1,
    },
    sheet => {
      expect(sheet["A1"].v).to.eq("ID");
      expect(sheet["A2"].v).to.eq(1);
      expect(sheet["B1"].v).to.eq("User ID");
      expect(sheet["B2"].v).to.eq(1);

      assertSheetRowsCount(length)(sheet);
    },
  );
}
