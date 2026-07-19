/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/funnel-title-navigation.cy.spec.ts
 *
 * Port notes:
 * - No gating tags upstream; runs on the EE spike backend as a normal user.
 * - The `cy.intercept("POST", "/api/dashboard/*\/dashcard/*\/card/*\/query")`
 *   + `cy.wait("@dashcardQuery")` becomes a waitForResponse registered BEFORE
 *   visitDashboard, awaited after (PORTING rule 2).
 * - `cy.location("pathname").should("contain", ...)` was retried by Cypress;
 *   the title-drill navigation is client-side, so assert with expect.poll over
 *   the pathname (mirrors title-drill.spec.ts).
 * - Setup (native funnel question + dashboard + visualizer dashcard) lives in
 *   support/funnel-title-navigation.ts; clickOnCardTitle / getDashboardCard /
 *   visitDashboard are imported read-only from the shared modules.
 */
import { getDashboardCard } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { createFunnelVisualizerDashboard } from "../support/funnel-title-navigation";
import { visitDashboard } from "../support/ui";
import { clickOnCardTitle } from "../support/visualizer-basics";

test.describe(
  "scenarios > dashboard > visualizer > funnel title navigation",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
    });

    test("should open the underlying question when clicking the title of a single-question visualizer funnel (UXW-2692)", async ({
      page,
      mb,
    }) => {
      const visualizerTitle = "UXW-2692 Visualizer Funnel";

      const { questionId, dashboardId } = await createFunnelVisualizerDashboard(
        mb.api,
        { visualizerTitle },
      );

      const dashcardQuery = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
            new URL(response.url()).pathname,
          ),
      );

      await visitDashboard(page, mb.api, dashboardId);

      await dashcardQuery;
      await expect(
        getDashboardCard(page, 0).getByTestId("funnel-chart"),
      ).toBeAttached();

      await clickOnCardTitle(page, 0);

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(`/question/${questionId}`);
    });
  },
);
