/**
 * Playwright port of e2e/test/scenarios/collections/revision-history.cy.spec.js
 */
import { editDashboard, saveDashboard, sidebar } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import {
  clickRevert,
  expectRevertSuccess,
  openQuestionsSidebar,
  openRevisionHistory,
  questionInfoButton,
  saveDashboardWithoutAwaitingRequests,
  sidesheet,
  waitForRevert,
} from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { visitDashboard, visitQuestion } from "../support/ui";

/**
 * The Cypress original also lists a "no" group (nocollection, nosql, none),
 * but its `onlyOn` guards generate no tests for it — only these two groups
 * produce test cases.
 */
const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
} as const;

test.describe("revision history", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("reproductions", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("shouldn't render revision history steps when there was no diff (metabase#1926)", async ({
      page,
      mb,
    }) => {
      const { id } = await mb.api.createDashboard();
      await visitDashboard(page, mb.api, id);
      await editDashboard(page);

      // Save the dashboard without any changes made to it (TODO: we should
      // probably disable "Save" button in the first place)
      await saveDashboardWithoutAwaitingRequests(page);
      await editDashboard(page);
      await saveDashboardWithoutAwaitingRequests(page);

      await openRevisionHistory(page);

      await expect(page.getByText(/created this/)).toBeVisible();
      await expect(page.getByText("Revert", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("curate access", () => {
    for (const user of PERMISSIONS.curate) {
      test.describe(`${user} user`, () => {
        test.beforeEach(async ({ mb }) => {
          await mb.signInAsAdmin();
          // Generate some history for the question
          await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
            name: "Orders renamed",
          });

          if (user !== "admin") {
            await mb.signIn(user);
          }
        });

        test("shouldn't create a rearrange revision when adding a card (metabase#6884)", async ({
          page,
          mb,
        }) => {
          const { id } = await mb.api.createDashboard();
          await visitDashboard(page, mb.api, id);
          await editDashboard(page);

          await openQuestionsSidebar(page);
          const cardQuery = page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              /^\/api\/card\/\d+\/query$/.test(
                new URL(response.url()).pathname,
              ),
          );
          await sidebar(page)
            .getByText("Orders, Count", { exact: true })
            .click();
          await cardQuery;

          // saveDashboard already waits for the save PUT, metadata GET, the
          // edit bar to disappear, and dashcards to load (no separate
          // dashboard GET fires after save). Keep the original's small beat
          // so the sidesheet isn't closed by the editing-state flip.
          await saveDashboard(page);
          await page.waitForTimeout(100);

          await openRevisionHistory(page);
          const sheet = sidesheet(page);
          await sheet
            .getByRole("tab", { name: "History", exact: true })
            .click();
          // "added a card" is the newest revision, so it gets no revert
          // button (the Cypress spec asserted this via .siblings("button")),
          // and no "rearranged the cards" revision may exist at all.
          const addedACardEvent = sheet
            .getByTestId("revision-history-event")
            .filter({ hasText: /added a card/ });
          await expect(addedACardEvent).toBeVisible();
          await expect(addedACardEvent.getByRole("button")).toHaveCount(0);
          await expect(sheet.getByText(/rearranged the cards/)).toHaveCount(0);
        });

        test("should be able to revert a dashboard (metabase#15237)", async ({
          page,
          mb,
        }) => {
          await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
          await openRevisionHistory(page);

          const firstRevert = waitForRevert(page);
          await clickRevert(page, /created this/);
          await expectRevertSuccess(firstRevert);

          // We reverted the dashboard to the state prior to adding any cards to it
          await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();

          // Should be able to revert back again
          await expect(
            page.getByTestId("dashboard-history-list"),
          ).toContainText("You reverted to an earlier version.");

          const secondRevert = waitForRevert(page);
          await clickRevert(page, /added a card/);
          await expectRevertSuccess(secondRevert);

          await expect(page.getByTestId("visualization-root")).toContainText(
            "117.03",
          );
        });

        test("should be able to access the question's revision history via the revision history button in the header of the query builder", async ({
          page,
        }) => {
          test.skip(user === "nodata", "skipped for the nodata user upstream");

          await visitQuestion(page, ORDERS_QUESTION_ID);

          await page.getByTestId("revision-history-button").click();
          await page.getByRole("tab", { name: "History", exact: true }).click();

          const revert = waitForRevert(page);
          await page.getByTestId("question-revert-button").click();
          await expectRevertSuccess(revert);

          // cy.contains(/^Orders$/) passes on multiple matches; mirror it
          // with .first() (the reverted title renders in several places).
          await expect(page.getByText(/^Orders$/).first()).toBeVisible();
        });

        test("should be able to revert the question via the action button found in the saved question timeline", async ({
          page,
        }) => {
          test.skip(user === "nodata", "skipped for the nodata user upstream");

          await visitQuestion(page, ORDERS_QUESTION_ID);

          await questionInfoButton(page).click();
          await page.getByRole("tab", { name: "History", exact: true }).click();

          // Last revert is the original state
          const revert = waitForRevert(page);
          await page.getByTestId("question-revert-button").last().click();
          await expectRevertSuccess(revert);

          await expect(page.getByText(/^Orders$/).first()).toBeVisible();
        });
      });
    }
  });

  test.describe("view access", () => {
    for (const user of PERMISSIONS.view) {
      test.describe(`${user} user`, () => {
        test("should not see question nor dashboard revert buttons (metabase#13229)", async ({
          page,
          mb,
        }) => {
          await mb.signIn(user);

          await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
          await openRevisionHistory(page);
          await expect(
            page.getByRole("button", { name: "Revert", exact: true }),
          ).toHaveCount(0);

          await visitQuestion(page, ORDERS_QUESTION_ID);
          await page.getByRole("button", { name: /Edited .*/ }).click();

          await expect(
            page.getByRole("button", { name: "Revert", exact: true }),
          ).toHaveCount(0);
        });
      });
    }
  });
});
