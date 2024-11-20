import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  assertEChartsTooltip,
  chartPathWithFillColor,
  echartsContainer,
  modal,
  restore,
  sankeyEdge,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const SANKEY_QUERY = `
SELECT 'Social Media' AS source, 'Landing Page' AS target, 300 AS metric
UNION ALL
SELECT 'Email Campaign', 'Landing Page', 200
UNION ALL
SELECT 'Paid Search', 'Landing Page', 250
UNION ALL
SELECT 'Landing Page', 'Signup Form', 600
UNION ALL
SELECT 'Signup Form', 'Free Trial', 400
UNION ALL
SELECT 'Signup Form', 'Abandoned Signup', 200
UNION ALL
SELECT 'Free Trial', 'Onboarding', 300
UNION ALL
SELECT 'Free Trial', 'Churned During Trial', 100
UNION ALL
SELECT 'Onboarding', 'Active Users', 250
UNION ALL
SELECT 'Onboarding', 'Churned After Onboarding', 50
UNION ALL
SELECT 'Active Users', 'Paid Subscription', 200
UNION ALL
SELECT 'Active Users', 'Cancelled Subscription', 50;
`;

describe("scenarios > visualizations > sankey", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should render with configured visualization settings", () => {
    visitQuestionAdhoc({
      display: "bar",
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
    echartsContainer().findByText("Social Media");

    // Edit viz settings
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar")
      .as("settings-sidebar")
      .findByText("Display")
      .click();

    // Shows colored edges by default
    sankeyEdge("#509EE3");

    // Set edge colors to Gray
    cy.get("@settings-sidebar").findByText("Gray").click();

    // Ensure it shows gray edges
    sankeyEdge("#81898e");

    // Ensure it does not show edge labels by default
    echartsContainer().findByText("600").should("not.exist");

    // Enable edge labels
    cy.get("@settings-sidebar").findByLabelText("Show edge labels").click();

    // Ensure it shows edge labels
    echartsContainer().findByText("600");

    // Ensure tooltip shows correct values
    sankeyEdge("#81898e").eq(0).realHover();
    assertEChartsTooltip({
      header: "Social Media → Landing Page",
      rows: [
        {
          name: "METRIC",
          value: "300",
        },
      ],
    });

    chartPathWithFillColor("#509EE3").realHover();
    assertEChartsTooltip({
      header: "Social Media",
      rows: [
        {
          name: "METRIC",
          value: "0",
        },
      ],
    });

    // Ensure saving the question works
    cy.findByTestId("qb-save-button").click();
    cy.findByPlaceholderText("What is the name of your question?").type(
      "My Sankey chart",
    );
    cy.findByTestId("save-question-modal").findByText("Save").click();
    modal().findByText("Saved! Add this to a dashboard?");
  });
});
