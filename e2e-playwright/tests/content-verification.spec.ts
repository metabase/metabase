/**
 * Playwright port of e2e/test/scenarios/organization/content-verification.cy.spec.js
 *
 * Smoke tests for the content verification feature; detailed coverage lives
 * in backend and frontend unit tests (see the Cypress spec's header comment).
 */
import { resolveToken } from "../support/api";
import { dashboardHeader } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { openQuestionActions } from "../support/models";
import {
  ORDERS_COUNT_QUESTION_ID,
  openDashboardMenu,
} from "../support/organization";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

test.describe("scenarios > premium > content verification", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("admin can verify and unverify a question", async ({ page }) => {
    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

    // Verify the question
    await openQuestionActions(page, "Verify this question");
    await expect(icon(queryBuilderHeader(page), "verified")).toBeVisible();

    // Remove verification
    await openQuestionActions(page, "Remove verification");
    await expect(icon(queryBuilderHeader(page), "verified")).toHaveCount(0);
  });

  test("admin can verify and unverify a dashboard", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    // Verify the dashboard
    await openDashboardMenu(page, "Verify this dashboard");
    await expect(icon(dashboardHeader(page), "verified")).toBeVisible();

    // Remove verification
    await openDashboardMenu(page, "Remove verification");
    await expect(icon(dashboardHeader(page), "verified")).toHaveCount(0);
  });
});
