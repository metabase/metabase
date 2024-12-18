import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const SANKEY_QUERY = `
SELECT 'Social Media' AS source, 'Landing Page' AS target, 30000 AS metric
UNION ALL
SELECT 'Email Campaign', 'Landing Page', 20000
UNION ALL
SELECT 'Paid Search', 'Landing Page', 25000
UNION ALL
SELECT 'Landing Page', 'Signup Form', 60000
UNION ALL
SELECT 'Signup Form', 'Free Trial', 40000
UNION ALL
SELECT 'Signup Form', 'Abandoned Signup', 20000
UNION ALL
SELECT 'Free Trial', 'Onboarding', 30000
UNION ALL
SELECT 'Free Trial', 'Churned During Trial', 10000
UNION ALL
SELECT 'Onboarding', 'Active Users', 25000
UNION ALL
SELECT 'Onboarding', 'Churned After Onboarding', 5000
UNION ALL
SELECT 'Active Users', 'Paid Subscription', 20000
UNION ALL
SELECT 'Active Users', 'Cancelled Subscription', 5000;
`;

describe("scenarios > visualizations > sankey", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render sankey charts in query builder", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "native",
        native: {
          query: SANKEY_QUERY,
        },
        database: SAMPLE_DB_ID,
      },
    });

    // Select Sankey viz type
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Sankey-button").click();

    // Ensure it shows node labels
    H.echartsContainer().findByText("Social Media");

    // Edit viz settings
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar")
      .as("settings-sidebar")
      .findByText("Display")
      .click();

    // Shows colored edges by default
    H.sankeyEdge("#509EE3");

    // Set edge colors to Gray
    cy.get("@settings-sidebar").findByText("Gray").click();

    // Ensure it shows gray edges
    H.sankeyEdge("#81898e");

    // Ensure it does not show edge labels by default
    H.echartsContainer().findByText("60,000").should("not.exist");

    // Enable edge labels
    cy.get("@settings-sidebar")
      .findByLabelText("Show edge labels")
      .click({ force: true });

    // Ensure it shows edge labels
    H.echartsContainer().findByText("60,000");

    // Apply compact formatting
    cy.get("@settings-sidebar").findByText("Compact").click();

    // Ensure it shows compact labels
    H.echartsContainer().findByText("60.0k");

    // Ensure tooltip shows correct values for edges
    H.sankeyEdge("#81898e").eq(8).realHover();
    H.assertEChartsTooltip({
      header: "Onboarding → Active Users",
      rows: [
        {
          color: "#F7C41F",

          name: "Active Users",
          value: "25,000",
          secondaryValue: "83.33 %",
        },
        {
          color: "#F2A86F",
          name: "Churned After Onboarding",
          value: "5,000",
          secondaryValue: "16.67 %",
        },
      ],
      footer: { name: "Total", value: "30,000", secondaryValue: "100 %" },
    });

    // Ensure tooltip shows correct values for nodes
    H.chartPathWithFillColor("#E75454").realHover();
    H.assertEChartsTooltip({
      header: "Onboarding",
      rows: [
        {
          color: "#F7C41F",
          name: "Active Users",
          value: "25,000",
          secondaryValue: "83.33 %",
        },
        {
          color: "#F2A86F",
          name: "Churned After Onboarding",
          value: "5,000",
          secondaryValue: "16.67 %",
        },
      ],
      footer: { name: "Total", value: "30,000", secondaryValue: "100 %" },
      blurAfter: true,
    });

    // Ensure saving the question works
    cy.findByTestId("qb-save-button").click();
    cy.findByPlaceholderText("What is the name of your question?").type(
      "My Sankey chart",
    );
    cy.findByTestId("save-question-modal").findByText("Save").click();
    H.modal().findByText("Saved! Add this to a dashboard?");
  });

  it("should render sankey charts in dashboard context", () => {
    H.createDashboard({
      name: "Sankey Dashboard",
    }).then(({ body: dashboard }) => {
      H.createNativeQuestion({
        name: "Sankey Question",
        native: {
          query: SANKEY_QUERY,
        },
        display: "sankey",
        visualization_settings: {
          "graph.show_values": true,
          "graph.label_value_formatting": "compact",
        },
      }).then(({ body: card }) => {
        H.addOrUpdateDashboardCard({
          card_id: card.id,
          dashboard_id: dashboard.id,
          card: {
            size_x: 12,
            size_y: 8,
          },
        });

        H.visitDashboard(dashboard.id);
      });
    });

    H.echartsContainer().findByText("Social Media");

    // Ensure drill-through works
    H.chartPathWithFillColor("#ED8535").first().click();
    H.popover().within(() => {
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");

      cy.findByText("Is Paid Subscription").click();
    });

    cy.findAllByTestId("filter-pill").should("have.length", 1);
    cy.findByTestId("filter-pill").within(() => {
      cy.findByText("TARGET is Paid Subscription").should("be.visible");
    });
  });
});
