/**
 * Playwright port of
 * e2e/test/scenarios/filters-reproductions/dashboard-filters-with-question-revert.cy.spec.js
 *
 * Reproductions grab-bag around a dashboard filter whose connection is lost /
 * re-gained when the underlying question is reverted between its GUI and native
 * (template-tag) versions (metabase#35954, also exercises metabase#45022).
 *
 * Porting notes:
 * - The Cypress before() builds a seeded snapshot ("35954") once and every test
 *   restores it. Replicated with a module-level snapshotReady flag; the backend
 *   is per-worker, so once-per-worker matches upstream's once-per-run. The build
 *   drives the entire revert-through-the-UI flow, including upstream's mid-build
 *   "root out the flakiness" assertions. The dashboard/question ids are captured
 *   module-level (the snapshot preserves them across restores).
 * - cy.intercept("POST","/api/revision/revert") + "/api/card/*\/query" →
 *   waitForResponse registered before the revert click, awaited after.
 * - assertFilterIsApplied/Disconnected: Cypress should("contain") over the
 *   cell-data set is a combined-text substring check → toPass over the joined
 *   allInnerTexts (see support/dashboard-filters-with-question-revert.ts).
 * - The ?number=3 that reappears on a fresh visitDashboard is Metabase's
 *   per-user last-used parameter value (set when "3" was applied in the build),
 *   captured in the snapshot — not a saved default.
 * - Embedding preview: openLegacyStaticEmbeddingModal({activeTab:"parameters",
 *   previewMode:"preview"}) performs the Parameters-tab + Preview clicks upstream
 *   did by hand inside the embedding-preview panel; the two @previewEmbed waits
 *   become a positive iframe-heading load gate (embedding-reproductions
 *   precedent).
 */
import { test, expect } from "../support/fixtures";
import type { MetabaseApi } from "../support/api";

import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  setFilter,
  waitForDashcardsToLoad,
} from "../support/dashboard";
import { filterWidget } from "../support/dashboard-parameters";
import {
  assertFilterIsApplied,
  assertFilterIsDisconnected,
  connectFilterToColumn,
  updatedQuestionDetails,
} from "../support/dashboard-filters-with-question-revert";
import { createQuestionAndDashboard } from "../support/factories";
import { getIframeBody } from "../support/embedding-repros";
import {
  openLegacyStaticEmbeddingModal,
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import { questionInfoButton } from "../support/revisions";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard, visitQuestion } from "../support/ui";

const { REVIEWS_ID } = SAMPLE_DATABASE;

const SNAPSHOT_NAME = "35954";

const questionDetails = {
  name: "35954",
  query: {
    "source-table": REVIEWS_ID,
    limit: 2,
  },
};

const dashboardDetails = {
  name: "35954D",
};

// The seeded snapshot is built once per worker (each worker owns its own
// backend under PW_PER_WORKER_BACKEND) — the port of the Cypress before().
let snapshotReady = false;
let dashboardId: number;
let questionId: number;

async function buildSnapshot(page: import("@playwright/test").Page, mb: { restore: (n?: string) => Promise<void>; signInAsAdmin: () => Promise<void>; api: MetabaseApi }) {
  await mb.restore();
  await mb.signInAsAdmin();

  const { dashboard_id, card_id } = await createQuestionAndDashboard(mb.api, {
    questionDetails,
    dashboardDetails,
    cardDetails: { size_x: 16, size_y: 8 },
  });
  dashboardId = dashboard_id;
  questionId = card_id;

  await mb.api.put(`/api/card/${card_id}`, updatedQuestionDetails);

  await visitDashboard(page, mb.api, dashboard_id);
  await editDashboard(page);

  // Add the number filter.
  await setFilter(page, "Number");
  await connectFilterToColumn(page, "Field-mapped Rating");
  await saveDashboard(page);

  // Give it a value and make sure the filter applies.
  await filterWidget(page).first().click();
  await popover(page).getByText("3", { exact: true }).click();
  await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();
  await assertFilterIsApplied(page);

  // Drill down to the question from the dashboard.
  await page.getByTestId("legend-caption-title").click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/question/${card_id}-${questionDetails.name}`);
  await expect.poll(() => new URL(page.url()).search).toBe("?RATING=3");

  // Revert the question to its original (GUI) version.
  const revertQuestion = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/revision/revert",
  );
  const cardQuery = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
  await questionInfoButton(page).click();
  await page.getByRole("tab", { name: "History", exact: true }).click();

  const historyList = page.getByTestId("saved-question-history-list");
  await historyList
    .getByTestId("revision-history-event")
    .filter({ hasText: /You created this/ })
    .getByTestId("question-revert-button")
    .click();
  await revertQuestion;
  await cardQuery;

  // Mid-build assertions to root out the flakiness (from upstream's before()).
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(historyList).toContainText("You edited this");
  await expect(historyList.getByTestId("question-revert-button")).toHaveCount(2);

  await page.getByLabel("Close", { exact: true }).click();
  await page
    .getByLabel(`Back to ${dashboardDetails.name}`, { exact: true })
    .click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/dashboard/${dashboard_id}-${dashboardDetails.name.toLowerCase()}`);
  await expect.poll(() => new URL(page.url()).search).toBe("?number=3");

  // The disconnected filter must not break the UI (the filter still carries the
  // value 3, but it's disconnected so it doesn't affect results).
  await assertFilterIsDisconnected(page);

  // Reloading the dashboard breaks the filter in the original issue.
  await page.reload();
  await waitForDashcardsToLoad(page);

  await editDashboard(page);
  await filterWidget(page, { isEditing: true }).first().click();
  await expect(getDashboardCard(page)).toContainText("Unknown Field");

  await mb.api.snapshot(SNAPSHOT_NAME);
}

test.describe("issue 35954", () => {
  test.describe("dashboard filter that loses connection should not crash the UI (metabase#35954)", () => {
    test.beforeEach(async ({ page, mb }) => {
      if (!snapshotReady) {
        await buildSnapshot(page, mb);
        snapshotReady = true;
      }
      await mb.restore(SNAPSHOT_NAME);
      await mb.signInAsAdmin();
    });

    test("should be able to remove the broken connection and connect the filter to the GUI question", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);

      await filterWidget(page, { isEditing: true }).first().click();
      await getDashboardCard(page)
        .getByLabel("Disconnect", { exact: true })
        .click();
      await connectFilterToColumn(page, "Rating");
      await saveDashboard(page);

      await expect.poll(() => new URL(page.url()).search).toBe("?number=3");
      await assertFilterIsApplied(page);
    });

    test("filter should automatically be re-connected when the question is reverted back to the SQL version", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, questionId);

      await questionInfoButton(page).click();
      await page.getByRole("tab", { name: "History", exact: true }).click();
      await page
        .getByTestId("saved-question-history-list")
        .getByTestId("revision-history-event")
        .filter({ hasText: /You edited this/ })
        .getByTestId("question-revert-button")
        .click();

      await expect.poll(() => new URL(page.url()).search).toBe("?RATING=");
      await assertFilterIsDisconnected(page);

      await visitDashboard(page, mb.api, dashboardId);
      await expect.poll(() => new URL(page.url()).search).toBe("?number=3");
      await assertFilterIsApplied(page);
    });

    test("should work for public dashboards", async ({ page, mb }) => {
      const response = await mb.api.post(
        `/api/dashboard/${dashboardId}/public_link`,
      );
      const { uuid } = (await response.json()) as { uuid: string };
      // Set the filter through the URL.
      await page.goto(`/public/dashboard/${uuid}?number=3`);

      await assertFilterIsDisconnected(page);
    });

    test("should work for embedding preview", async ({ page, mb }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        embedding_params: { number: "enabled" },
        enable_embedding: true,
      });

      // Discard the legalese modal so we don't need an extra UI click.
      await mb.api.updateSetting("show-static-embed-terms", false);

      await visitDashboard(page, mb.api, dashboardId);
      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: dashboardId,
        activeTab: "parameters",
        previewMode: "preview",
      });

      const frame = getIframeBody(page);
      // Positive load gate — the port of upstream's two @previewEmbed waits (one
      // for the dashboard, one for the dashcard).
      await expect(
        frame.getByRole("heading", { name: dashboardDetails.name, exact: true }),
      ).toBeVisible();

      await assertFilterIsDisconnected(frame);

      await frame.getByTestId("parameter-widget").first().click();
      const numberInput = frame.getByPlaceholder("Enter a number");
      await numberInput.pressSequentially("3");
      await numberInput.press("Enter");
      await frame
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await assertFilterIsDisconnected(frame);
    });

    test("should work for embedding with the editable parameter", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        embedding_params: { number: "enabled" },
        enable_embedding: true,
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });
      await assertFilterIsDisconnected(page);

      await filterWidget(page).first().click();
      const numberInput = page.getByPlaceholder("Enter a number");
      await numberInput.pressSequentially("3");
      await numberInput.press("Enter");
      await page.getByRole("button", { name: "Add filter", exact: true }).click();

      await assertFilterIsDisconnected(page);
    });

    test("should work for embedding with the locked parameter", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        embedding_params: { number: "locked" },
        enable_embedding: true,
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: { number: [3] },
      });
      await assertFilterIsDisconnected(page);
    });
  });
});
