const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const INCREASE_COLOR = "#88BF4D";
const TOTAL_COLOR = "#303D46";

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should save a waterfall chart in single-series mode and render it after a reload (metabase#15152)", () => {
    H.createQuestion(
      {
        name: "Q1",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        display: "line",
      },
      { visitQuestion: true, wrapId: true },
    );

    H.openVizTypeSidebar();
    switchToWaterfallDisplay();

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist");
      cy.findByText("Sum of Total").should("not.exist");
    });
    H.chartPathWithFillColor(TOTAL_COLOR).realHover();
    H.assertEChartsTooltip({
      header: "Total",
      rows: [{ name: "Count", value: "18,760", color: TOTAL_COLOR }],
    });

    H.leftSidebar().findByDisplayValue("Count").click();
    H.popover().findByText("Sum of Total").click();
    H.echartsContainer().findByText("Sum of Total").should("exist");

    H.saveSavedQuestion();
    cy.get("@updateQuestion")
      .its("request.body")
      .should((body) => {
        expect(body.display).to.equal("waterfall");
        expect(body.visualization_settings["graph.metrics"]).to.deep.equal([
          "sum",
        ]);
      });

    // open the saved question again, which reruns its query on the backend
    H.visitQuestion("@questionId");

    H.echartsContainer().within(() => {
      cy.findByText("Sum of Total").should("exist");
      cy.findByText("Created At: Year").should("exist");
      cy.findByText("Total").should("exist");
      cy.findByText("Count").should("not.exist");
    });
    H.chartPathWithFillColor(INCREASE_COLOR).first().realHover();
    H.assertEChartsTooltip({
      header: "2025",
      rows: [
        { name: "Sum of Total", value: "42,156.87", color: INCREASE_COLOR },
      ],
    });
  });
});

const switchToWaterfallDisplay = () => {
  H.leftSidebar().within(() => {
    cy.findByTestId("more-charts-toggle").then(($toggle) => {
      if (
        $toggle.closest("[aria-expanded]").attr("aria-expanded") === "false"
      ) {
        cy.wrap($toggle).click();
      }
    });
    cy.icon("waterfall").click();
  });
  cy.findByTestId("Waterfall-container").within(() => {
    cy.icon("gear").click();
  });
};
