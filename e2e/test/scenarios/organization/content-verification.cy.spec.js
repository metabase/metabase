const { H } = cy;
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

/**
 * Smoke tests for content verification feature.
 *
 * Detailed coverage exists in:
 * - Backend: enterprise/backend/test/metabase_enterprise/content_verification/api/moderation_review_test.clj
 * - Frontend: enterprise/frontend/src/metabase-enterprise/moderation/service.unit.spec.ts
 * - Components: Multiple unit tests for ModerationStatusIcon, ModerationReviewBanner, etc.
 * - Menu items: frontend/src/metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionMoreActionsMenu/tests/QuestionMoreActionsMenu.enterprise.unit.spec.tsx
 */
describe("scenarios > premium > content verification", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("admin can verify and unverify a question", () => {
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

    cy.log("Verify the question");
    H.openQuestionActions();
    cy.findByTextEnsureVisible("Verify this question").click();

    cy.findByTestId("qb-header").icon("verified").should("be.visible");

    cy.log("Remove verification");
    H.openQuestionActions();
    cy.findByTextEnsureVisible("Remove verification").click();

    cy.findByTestId("qb-header").icon("verified").should("not.exist");
  });

  it("admin can verify and unverify a dashboard", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.log("Verify the dashboard");
    H.openDashboardMenu();
    cy.findByTextEnsureVisible("Verify this dashboard").click();

    cy.findByTestId("dashboard-header").icon("verified").should("be.visible");

    cy.log("Remove verification");
    H.openDashboardMenu();
    cy.findByTextEnsureVisible("Remove verification").click();

    cy.findByTestId("dashboard-header").icon("verified").should("not.exist");
  });
});
