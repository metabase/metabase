import {
  restore,
  downloadAndAssert,
  startNewQuestion,
  visualize,
  visitDashboard,
  popover,
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
      cy.findAllByTestId("download-button").eq(0).should("be.visible").click();

      popover().within(() => {
        cy.findByText(".png").click();
      });

      cy.findByText("Q2").realHover();
      cy.findAllByTestId("download-button").eq(1).should("be.visible").click();

      popover().within(() => {
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
