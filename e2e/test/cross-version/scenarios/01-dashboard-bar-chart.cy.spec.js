/**
 * Cross-version test: Dashboard with bar chart
 *
 * Tests that a dashboard with a bar chart question survives migration.
 */

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const QUESTION_NAME = "CrossVersion: Orders by Product Category";
const DASHBOARD_NAME = "CrossVersion: Bar Chart Dashboard";

describe("Cross-version: Dashboard with bar chart", () => {
  it("setup: creates dashboard with bar chart question", { tags: ["@source"] }, () => {
    cy.signIn("admin", { skipCache: true });

    H.createQuestionAndDashboard({
      questionDetails: {
        name: QUESTION_NAME,
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        visualization_settings: {
          "graph.dimensions": ["CATEGORY"],
          "graph.metrics": ["count"],
        },
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
      },
    });

    // Verify the dashboard is accessible
    cy.visit("/collection/root");
    cy.findByText(DASHBOARD_NAME).click();
    cy.findByText(QUESTION_NAME).should("be.visible");
  });

  it("verify: dashboard and bar chart display correctly", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    // Navigate to the dashboard
    cy.visit("/collection/root");
    cy.findByText(DASHBOARD_NAME).click();

    // Verify the question card is present
    cy.findByText(QUESTION_NAME).should("be.visible");

    // Verify the bar chart rendered (check for axis labels)
    cy.findByText("Doohickey").should("be.visible");
    cy.findByText("Gadget").should("be.visible");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Widget").should("be.visible");
  });
});
