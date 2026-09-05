/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/sankey.cy.spec.js
 *
 * New helpers (sankeyEdge / mockDevelopmentMode) live in support/sankey.ts;
 * everything else is imported read-only from the shared modules.
 *
 * Mapping notes:
 * - `H.visitQuestionAdhoc({ dataset_query: { type: "native", … } })` — native
 *   ad-hoc queries are not autorun from the URL hash, so the Cypress helper
 *   runs the query itself → visitNativeAdhoc.
 * - ECharts SVG `<text>` (node/edge labels) can carry leading/trailing spaces,
 *   which Playwright's getByText does NOT trim (unlike testing-library). Match
 *   with the whitespace-tolerant `echartsText` (legend.ts) — exact but padding-
 *   proof.
 * - `cy.intercept("/api/session/properties", req => req.continue(res => …))`
 *   → mockDevelopmentMode (page.route that pokes token-features.development_mode).
 * - The two dashboard-context tests keep their distinct `development-mode: …`
 *   titles (no duplicate-title collision).
 */
import { chartPathWithFillColor } from "../support/binning";
import { openVizSettingsSidebar } from "../support/charts";
import { openVizTypeSidebar } from "../support/charts-extras";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { createDashboard, createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { echartsText } from "../support/legend";
import { checkSavedToCollectionQuestionToast } from "../support/question-new";
import { SAMPLE_DB_ID } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";
import { assertEChartsTooltip, visitNativeAdhoc } from "../support/viz-charts-repros";
import { vizSettingsSidebar } from "../support/viz-charts-repros";
import { mockDevelopmentMode, sankeyEdge } from "../support/sankey";

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

test.describe("scenarios > visualizations > sankey", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render sankey charts in query builder", async ({ page }) => {
    await visitNativeAdhoc(page, {
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
    await openVizTypeSidebar(page);
    await page.getByTestId("Sankey-button").click();

    // Ensure it shows node labels
    await expect(echartsText(page, "Social Media").first()).toBeVisible();

    // Edit viz settings
    await openVizSettingsSidebar(page);
    const settingsSidebar = vizSettingsSidebar(page);
    await settingsSidebar.getByText("Display", { exact: true }).click();

    // Shows colored edges by default
    await expect(sankeyEdge(page, "#509EE3").first()).toBeVisible();

    // Set edge colors to Gray
    await settingsSidebar.getByText("Gray", { exact: true }).click();

    // Ensure it shows gray edges
    await expect(sankeyEdge(page, "#81898e").first()).toBeVisible();

    // Ensure it does not show edge labels by default
    await expect(echartsText(page, "60,000")).toHaveCount(0);

    // Enable edge labels
    await settingsSidebar
      .getByLabel("Show edge labels", { exact: true })
      .click({ force: true });

    // Ensure it shows edge labels
    await expect(echartsText(page, "60,000").first()).toBeVisible();

    // Apply compact formatting
    await settingsSidebar.getByText("Compact", { exact: true }).click();

    // Ensure it shows compact labels
    await expect(echartsText(page, "60.0k").first()).toBeVisible();

    // Ensure tooltip shows correct values for edges
    // The edge's own value label <text> overlays the path and intercepts a
    // plain hover (zrender hit-tests by coordinate); realHover fires regardless.
    await sankeyEdge(page, "#81898e").nth(8).hover({ force: true });
    await assertEChartsTooltip(page, {
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
    // realHover on a jQuery set hovers the first element (port rule 3).
    await chartPathWithFillColor(page, "#E75454").first().hover({ force: true });
    await assertEChartsTooltip(page, {
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
    await page.getByTestId("qb-save-button").click();
    await page
      .getByPlaceholder("What is the name of your question?", { exact: true })
      .fill("My Sankey chart");
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await checkSavedToCollectionQuestionToast(page);
  });

  for (const devMode of [false, true]) {
    test(`should render sankey charts in dashboard context - development-mode: ${devMode}`, async ({
      page,
      mb,
    }) => {
      await mockDevelopmentMode(page, devMode);

      const dashboard = await createDashboard(mb.api, {
        name: "Sankey Dashboard",
      });
      const card = await createNativeQuestion(mb.api, {
        name: "Sankey Question",
        native: {
          query: SANKEY_QUERY,
        },
        display: "sankey",
        visualization_settings: {
          "graph.show_values": true,
          "graph.label_value_formatting": "compact",
        },
      });
      await addOrUpdateDashboardCard(mb.api, {
        card_id: card.id,
        dashboard_id: dashboard.id,
        card: {
          size_x: 12,
          size_y: 8,
        },
      });

      await visitDashboard(page, mb.api, dashboard.id);

      await expect(echartsText(page, "Social Media").first()).toBeVisible();

      // Ensure drill-through works
      await chartPathWithFillColor(page, "#ED8535").first().click();
      const pop = popover(page);
      await expect(pop.getByText("=", { exact: true })).toBeVisible();
      await expect(pop.getByText("≠", { exact: true })).toBeVisible();
      await pop.getByText("Is Paid Subscription", { exact: true }).click();

      await expect(page.getByTestId("filter-pill")).toHaveCount(1);
      await expect(
        page
          .getByTestId("filter-pill")
          .getByText("TARGET is Paid Subscription", { exact: true }),
      ).toBeVisible();
    });
  }
});
