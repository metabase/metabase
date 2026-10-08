const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > gauge chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not rerender on gauge arc hover (metabase#15980)", () => {
    const questionDetails = {
      name: "15980",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "gauge",
      visualization_settings: {
        "gauge.segments": [
          { min: 0, max: 10000, color: "#ED6E6E", label: "" },
          { min: 10000, max: 30000, color: "#84BB4C", label: "Goal" },
        ],
      },
    };

    // A small dashboard card hides the gauge labels and shows them in a tooltip on hover
    H.createQuestionAndDashboard({
      questionDetails,
      cardDetails: { size_x: 5, size_y: 4 },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });

    // Hover a segment without a label, then a segment with a label
    H.getDashboardCard().findByTestId("gauge-arc-0").trigger("mousemove");

    H.getDashboardCard().findByTestId("gauge-arc-1").trigger("mousemove");
    H.tooltip().should("contain", "Goal").and("contain", "10,000 - 30,000");

    H.getDashboardCard().findByTestId("gauge-arc-1").should("be.visible");
  });
});
