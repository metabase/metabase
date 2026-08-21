/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/gauge.cy.spec.js
 *
 * The Cypress spec creates the question + dashboard, then re-PUTs the
 * dashcard to shrink it; here the small size goes in as cardDetails on
 * creation — same final dashcard, one request.
 */
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > gauge chart", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not rerender on gauge arc hover (metabase#15980)", async ({
    page,
    mb,
  }) => {
    const { dashboardId } = await mb.api.createQuestionAndDashboard({
      questionDetails: {
        name: "15980",
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        display: "gauge",
      },
      // Make dashboard card really small (necessary for this repro as it
      // doesn't show any labels)
      cardDetails: { size_x: 5, size_y: 4, parameter_mappings: [] },
    });

    await visitDashboard(page, mb.api, dashboardId);

    // Faithful port of trigger("mousemove") — dispatch straight on the arc.
    await page.getByTestId("gauge-arc-1").dispatchEvent("mousemove");
    await expect(
      page.getByText("Something went wrong", { exact: true }),
    ).toHaveCount(0);
  });
});
