/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashcard-replace-question.cy.spec.js
 *
 * Snowplow assertions run against the per-slot collector (support/snowplow).
 */
import { saveDashboard } from "../support/dashboard";
import {
  ALL_USERS_GROUP,
  DASHBOARD_CREATE_INFO,
  MAPPED_QUESTION_CREATE_INFO,
  NEXT_QUESTION_CREATE_INFO,
  PARAMETER,
  assertDashCardTitle,
  assertDashboardFilterMapping,
  connectDashboardFilter,
  findHeadingDashcard,
  findTargetDashcard,
  getDashboardCards,
  overwriteDashCardTitle,
  replaceQuestion,
  updateCollectionGraph,
  visitDashboardAndEdit,
} from "../support/dashcard-replace-question";
import { createDashboard, createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { FIRST_COLLECTION_ID } from "../support/sample-data";
import { undoToastList } from "../support/organization";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

test.describe("scenarios > dashboard cards > replace question", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);

    const mappedQuestion = await createQuestion(
      mb.api,
      MAPPED_QUESTION_CREATE_INFO,
    );
    await createQuestion(mb.api, NEXT_QUESTION_CREATE_INFO);
    const dashboard = await createDashboard(mb.api, DASHBOARD_CREATE_INFO);
    dashboardId = dashboard.id;
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: getDashboardCards(mappedQuestion.id),
    });
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should replace a dashboard card question (metabase#36984)", async ({
    page,
    mb,
  }) => {
    await visitDashboardAndEdit(page, mb.api, dashboardId);

    await findHeadingDashcard(page).hover();
    await expect(
      findHeadingDashcard(page).getByLabel("Replace", { exact: true }),
    ).toHaveCount(0);

    // Ensure can replace with a question
    await replaceQuestion(findTargetDashcard(page), {
      nextQuestionName: "Orders",
    });
    await expectUnstructuredSnowplowEvent(mb, {
      event: "dashboard_card_replaced",
    });
    await assertDashCardTitle(findTargetDashcard(page), "Orders");
    await expect(
      findTargetDashcard(page).getByText("Product ID", { exact: true }),
    ).toBeVisible();

    // Ensure can replace with a model
    await replaceQuestion(findTargetDashcard(page), {
      nextQuestionName: "Orders Model",
    });
    await assertDashCardTitle(findTargetDashcard(page), "Orders Model");
    await expect(
      findTargetDashcard(page).getByText("Product ID", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("User ID", { exact: true }),
    ).toBeVisible();

    // Ensure changes are persisted
    await saveDashboard(page);
    await assertDashCardTitle(findTargetDashcard(page), "Orders Model");
    await expect(
      findTargetDashcard(page).getByText("Product ID", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("User ID", { exact: true }),
    ).toBeVisible();
  });

  test("should undo the question replace action", async ({ page, mb }) => {
    await visitDashboardAndEdit(page, mb.api, dashboardId);

    await overwriteDashCardTitle(page, "Custom name");
    await connectDashboardFilter(findTargetDashcard(page), {
      filterName: PARAMETER.UNUSED.name,
      columnName: "Discount",
    });

    await replaceQuestion(findTargetDashcard(page), {
      nextQuestionName: "Orders",
    });

    // There're two toasts: "Undo replace" and "Auto-connect".
    // eq(0) is "Undo replace". Cypress waited on $el.position().left === 0
    // (the slide-in animation settling) before clicking; Playwright's
    // actionability waits for a stable box, so the plain click covers it.
    await expect(undoToastList(page)).toHaveCount(2);
    await undoToastList(page)
      .first()
      .getByRole("button", { name: "Undo" })
      .click();

    // Ensure we kept viz settings and parameter mapping changes from before
    await assertDashCardTitle(findTargetDashcard(page), "Custom name");
    await expect(
      findTargetDashcard(page).getByText("18,760", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("Ean", { exact: true }),
    ).toHaveCount(0);
    await expect(
      findTargetDashcard(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toHaveCount(0);
    await assertDashboardFilterMapping(findTargetDashcard(page), {
      filterName: PARAMETER.UNUSED.name,
      expectedColumName: "Orders.Discount",
    });

    // Ensure changes are persisted
    await saveDashboard(page);
    await assertDashCardTitle(findTargetDashcard(page), "Custom name");
    await expect(
      findTargetDashcard(page).getByText("18,760", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("Ean", { exact: true }),
    ).toHaveCount(0);
    await expect(
      findTargetDashcard(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toHaveCount(0);
  });

  test("should handle questions with limited permissions", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
    });

    await mb.signIn("nodata");
    await visitDashboardAndEdit(page, mb.api, dashboardId);

    // Replacing with a read-only question with limited data perms
    await replaceQuestion(findTargetDashcard(page), {
      nextQuestionName: "Next question",
      collectionName: "First collection",
    });
    await assertDashCardTitle(findTargetDashcard(page), "Next question");
    await expect(
      findTargetDashcard(page).getByText("Ean", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();

    // Ensure changes are persisted
    await saveDashboard(page);
    await assertDashCardTitle(findTargetDashcard(page), "Next question");
    await expect(
      findTargetDashcard(page).getByText("Ean", { exact: true }),
    ).toBeVisible();
    await expect(
      findTargetDashcard(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();
  });
});
