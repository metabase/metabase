/**
 * Playwright port of
 * e2e/test/scenarios/question/question-management.cy.spec.js
 *
 * Multi-persona spec: editing question metadata, moving/adding-to-dashboard,
 * and permission-gated variants, driven from the question's details sidebar.
 *
 * Notes on the port:
 * - Snowplow helpers run real assertions, backed by the per-slot collector via
 *   ../support/snowplow; the UI flow they wrap ("Turn into a model" click) is
 *   ported for real too.
 * - The `cy.intercept("PUT","/api/card/:id").as("updateQuestion")` alias in the
 *   Cypress beforeEach becomes per-action `waitForCardUpdate` registrations
 *   (Playwright waits must be registered before the triggering action).
 * - EditableText title/description fields: `fill()` doesn't mark them dirty, so
 *   click + pressSequentially + blur. They render a <textarea>, so the upstream
 *   `findByText("Orders1")` / `findByText("foo")` (which match element text, not
 *   input values) are ported as `toHaveValue` on the field.
 */
import { createDashboard } from "../support/factories";
import { USER_GROUPS, updateCollectionGraph } from "../support/click-behavior";
import { createCollection } from "../support/dashboard-core";
import { test, expect } from "../support/fixtures";
import { openQuestionActions } from "../support/models";
import { entityPickerModal, entityPickerModalLevel } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { questionInfoButton } from "../support/revisions";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { pickEntity } from "../support/dashboard";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import type { UserName } from "../support/sample-data";
import {
  appBar,
  modal,
  openNavigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import {
  ORDERS_COUNT_QUESTION_ID,
  addToDashboardPopoverItem,
  assertActivePickerItem,
  assertInactivePickerItem,
  assertNot403,
  assertNoPermissionsError,
  assertSidebarItemSelected,
  getPersonalCollectionName,
  moveQuestionTo,
  turnIntoModel,
  waitForCardUpdate,
} from "../support/question-management";

const PERMISSIONS: Record<string, string[]> = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

test.describe("managing question from the question's details sidebar", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  for (const [permission, userGroup] of Object.entries(PERMISSIONS)) {
    test.describe(`${permission} access`, () => {
      for (const user of userGroup) {
        if (permission === "curate") {
          test.describe(`${user} user`, () => {
            test.beforeEach(async ({ page, mb }) => {
              await mb.signIn(user as UserName);
              await visitQuestion(page, ORDERS_QUESTION_ID);
            });

            test("should be able to edit question details (metabase#11719-1)", async ({
              page,
            }) => {
              const title = page.getByTestId("saved-question-header-title");
              await title.click();
              const titleInput = page.getByRole("textbox", {
                name: "Add title",
              });
              await expect(titleInput).toHaveValue("Orders");
              await titleInput.press("End");
              const update = waitForCardUpdate(page, ORDERS_QUESTION_ID);
              await titleInput.pressSequentially("1");
              await titleInput.blur();
              await assertNot403(update);
              await assertNoPermissionsError(page);
              await expect(titleInput).toHaveValue("Orders1");
            });

            test("should be able to edit a question's description", async ({
              page,
            }) => {
              await questionInfoButton(page).click();

              const description = page.getByPlaceholder("Add description");
              await description.click();
              const update = waitForCardUpdate(page, ORDERS_QUESTION_ID);
              await description.pressSequentially("foo");
              await description.blur();

              await assertNot403(update);
              await assertNoPermissionsError(page);

              // On blur the description EditableText collapses from a textarea
              // to a rendered Markdown node, so assert the shown text (as the
              // upstream findByText did), not the input value.
              await expect(page.getByText("foo", { exact: true })).toBeVisible();
            });

            test.describe("move", () => {
              test("should be able to move the question (metabase#11719-2)", async ({
                page,
              }) => {
                await openNavigationSidebar(page);
                // Highlight "Our analytics"
                await assertSidebarItemSelected(page, "Our analytics", "true");
                await assertSidebarItemSelected(
                  page,
                  "Your personal collection",
                  "false",
                );

                const update = waitForCardUpdate(page, ORDERS_QUESTION_ID);
                await moveQuestionTo(page, /Personal Collection/);
                await assertNot403(update);

                await expect(
                  page.getByRole("status").filter({
                    hasText: `Question moved to ${getPersonalCollectionName(user)}`,
                  }),
                ).toBeVisible();
                await assertNoPermissionsError(page);
                await expect(
                  page.getByRole("gridcell").filter({ hasText: "37.65" }).first(),
                ).toBeVisible();

                // Highlight "Your personal collection" after move
                await assertSidebarItemSelected(page, "Our analytics", "false");
                await assertSidebarItemSelected(
                  page,
                  "Your personal collection",
                  "true",
                );

                if (user === "admin") {
                  await openQuestionActions(page);
                  await page.getByTestId("move-button").click();
                  await entityPickerModal(page)
                    .getByText("Recent items", { exact: true })
                    .click();
                  await expect(
                    entityPickerModalLevel(page, 1).getByRole("link", {
                      name: /Orders in a dashboard/,
                    }),
                  ).toBeVisible();
                  await expect(
                    entityPickerModalLevel(page, 1).getByRole("link", {
                      name: /Bobby Table/,
                    }),
                  ).toHaveCount(0);
                }
              });

              test("should be able to move the question to a collection created on the go", async ({
                page,
              }) => {
                const NEW_COLLECTION_NAME = "Foo";

                await openQuestionActions(page);
                await page.getByTestId("move-button").click();
                await entityPickerModal(page)
                  .getByText(/Personal Collection/)
                  .click();
                await entityPickerModal(page)
                  .getByText("New collection", { exact: true })
                  .click();

                const onTheGo = page.getByTestId(
                  "create-collection-on-the-go",
                );
                await onTheGo
                  .getByPlaceholder("My new collection")
                  .fill(NEW_COLLECTION_NAME);
                await onTheGo.getByRole("button", { name: "Create" }).click();

                await entityPickerModal(page)
                  .getByRole("button", { name: "Move" })
                  .click();

                await expect(
                  page
                    .locator("header")
                    .getByText(NEW_COLLECTION_NAME, { exact: true }),
                ).toBeVisible();
              });

              test("should be able to move models", async ({ page }) => {
                // TODO: Currently nodata users can't turn a question into a model
                test.skip(
                  user === "nodata",
                  "nodata users can't turn a question into a model",
                );

                await turnIntoModel(page, ORDERS_QUESTION_ID);

                await openNavigationSidebar(page);
                // Highlight "Our analytics"
                await assertSidebarItemSelected(page, "Our analytics", "true");
                await assertSidebarItemSelected(
                  page,
                  "Your personal collection",
                  "false",
                );

                const update = waitForCardUpdate(page, ORDERS_QUESTION_ID);
                await moveQuestionTo(page, /Personal Collection/);
                await assertNot403(update);

                await expect(
                  page.getByRole("status").filter({
                    hasText: `Model moved to ${getPersonalCollectionName(user)}`,
                  }),
                ).toBeVisible();
                await assertNoPermissionsError(page);
                await expect(
                  page.getByRole("gridcell").filter({ hasText: "37.65" }).first(),
                ).toBeVisible();

                // Highlight "Your personal collection" after move
                await assertSidebarItemSelected(page, "Our analytics", "false");
                await assertSidebarItemSelected(
                  page,
                  "Your personal collection",
                  "true",
                );
              });
            });

            test.describe("Add to Dashboard", () => {
              test("should be able to add question to dashboard", async ({
                page,
              }) => {
                await openQuestionActions(page);
                await page.getByTestId("add-to-dashboard-button").click();

                const pickerModal = entityPickerModal(page);
                await pickerModal
                  .getByText("Our analytics", { exact: true })
                  .click();
                await pickerModal
                  .getByText("Orders in a dashboard", { exact: true })
                  .click();
                await pickerModal
                  .getByRole("button", { name: "Select" })
                  .click();

                await expect(entityPickerModal(page)).toHaveCount(0);
                // By default the dashboard contains one question; after adding a
                // new one there should be two.
                await expect(
                  page.getByTestId("dashcard-container"),
                ).toHaveCount(2);
              });

              test("should hide public collections when selecting a dashboard for a question in a personal collection", async ({
                page,
                mb,
              }) => {
                await createCollection(mb.api, {
                  name: "Collection in root collection",
                });
                await createDashboard(mb.api, {
                  name: "Dashboard in root collection",
                });

                const currentUser = await (
                  await mb.api.get("/api/user/current")
                ).json();
                const personalDashboard = await createDashboard(mb.api, {
                  name: "Personal Dashboard",
                  collection_id: currentUser.personal_collection_id,
                });

                // Simulate a couple gets, so the dashboards appear in recents.
                await mb.api.get(`/api/dashboard/${personalDashboard.id}`);
                await mb.api.get(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);

                // reload the page so the new collection is in the state
                await page.reload();

                // Move the question to a personal collection
                await moveQuestionTo(page, /Personal Collection/);

                // assert public collections are not visible
                await openQuestionActions(page);
                await addToDashboardPopoverItem(page).click();

                const pickerModal = entityPickerModal(page);
                await expect(
                  pickerModal.getByText("Add this question to a dashboard", {
                    exact: true,
                  }),
                ).toBeVisible();
                await expect(
                  pickerModal.getByRole("link", { name: /Personal Dashboard/ }),
                ).toBeVisible();
                await expect(
                  pickerModal.getByRole("link", {
                    name: /Orders in a dashboard/,
                  }),
                ).toHaveCount(0);
                await expect(
                  pickerModal.getByText(/'s personal collection/i),
                ).toBeVisible();
                await expect(
                  pickerModal.getByText(/our analytics/i),
                ).toHaveCount(0);
                await pickerModal.getByLabel("Close").click();

                // Move the question to the root collection
                await moveQuestionTo(page, "Our analytics");

                // assert all collections are visible
                await openQuestionActions(page);
                await addToDashboardPopoverItem(page).click();
                const pickerModal2 = entityPickerModal(page);
                await expect(
                  pickerModal2.getByText("Add this question to a dashboard", {
                    exact: true,
                  }),
                ).toBeVisible();
                await pickerModal2
                  .getByText("Recent items", { exact: true })
                  .click();
                await expect(
                  pickerModal2.getByRole("link", {
                    name: /Personal Dashboard/,
                  }),
                ).toBeVisible();
                await expect(
                  pickerModal2.getByRole("link", {
                    name: /Orders in a dashboard/,
                  }),
                ).toBeVisible();

                await expect(
                  entityPickerModalLevel(page, 0).getByText(
                    /'s personal collection/i,
                  ),
                ).toBeVisible();
                await expect(
                  entityPickerModalLevel(page, 0).getByText(/our analytics/i),
                ).toBeVisible();
              });

              if (user === "normal") {
                test("should preselect the most recently visited dashboard", async ({
                  page,
                  mb,
                }) => {
                  await openQuestionActions(page);
                  await page.getByTestId("add-to-dashboard-button").click();

                  await assertInactivePickerItem(
                    page,
                    "Orders in a dashboard",
                  );

                  // before visiting the dashboard, we don't have any history
                  await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
                  await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

                  await openQuestionActions(page);
                  await page.getByTestId("add-to-dashboard-button").click();

                  await pickEntity(page, {
                    path: ["Our analytics", "Orders in a dashboard"],
                  });
                });

                test("should handle lost access", async ({ page, mb }) => {
                  const mostRecentlyViewedDashboardPath =
                    "/api/activity/most_recently_viewed_dashboard";
                  const waitMostRecent = () =>
                    page.waitForResponse(
                      (response) =>
                        new URL(response.url()).pathname ===
                        mostRecentlyViewedDashboardPath,
                    );

                  let mostRecent = waitMostRecent();
                  await openQuestionActions(page);
                  await page.getByTestId("add-to-dashboard-button").click();
                  await mostRecent;
                  await assertInactivePickerItem(
                    page,
                    "Orders in a dashboard",
                  );

                  // before visiting the dashboard, we don't have any history
                  await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
                  await visitQuestion(page, ORDERS_QUESTION_ID);

                  mostRecent = waitMostRecent();
                  await openQuestionActions(page);
                  await page.getByTestId("add-to-dashboard-button").click();
                  await mostRecent;

                  await assertActivePickerItem(page, "Orders in a dashboard");

                  await entityPickerModal(page).getByLabel("Close").click();

                  await mb.signInAsAdmin();

                  // Let's revoke write access to "Our analytics"
                  await updateCollectionGraph(mb.api, {
                    [USER_GROUPS.COLLECTION_GROUP]: { root: "read" },
                  });
                  await mb.signOut();
                  await page.reload();
                  await mb.signIn(user as UserName);
                  await visitQuestion(page, ORDERS_QUESTION_ID);

                  mostRecent = waitMostRecent();
                  await openQuestionActions(page);
                  await page.getByTestId("add-to-dashboard-button").click();
                  await mostRecent;

                  await expect(
                    entityPickerModalItem(page, 1, "Orders in a dashboard"),
                  ).toHaveAttribute("data-disabled", "true");
                });
              }
            });
          });
        }

        if (permission === "view") {
          test.describe(`${user} user`, () => {
            test.beforeEach(async ({ page, mb }) => {
              await mb.signIn(user as UserName);
              await visitQuestion(page, ORDERS_QUESTION_ID);
            });

            test("should not be offered to add question to dashboard inside a collection they have `read` access to", async ({
              page,
            }) => {
              await openQuestionActions(page);
              await page.getByTestId("add-to-dashboard-button").click();

              await assertInactivePickerItem(page, "Orders in a dashboard");

              const pickerModal = entityPickerModal(page);
              const search = pickerModal.getByPlaceholder(/Search/);
              await search.click();
              await search.pressSequentially("Orders in a dashboard");
              await search.press("Enter");
              await expect(
                pickerModal.getByText(/didn't find anything/),
              ).toBeVisible();
            });

            test("should not offer a user the ability to update or clone the question", async ({
              page,
            }) => {
              await expect(
                page.getByTestId("edit-details-button"),
              ).toHaveCount(0);
              await expect(
                page.getByRole("button", { name: "Add a description" }),
              ).toHaveCount(0);

              await openQuestionActions(page);

              const actionsPopover = popover(page);
              await expect(
                actionsPopover.getByTestId("move-button"),
              ).toHaveCount(0);
              await expect(
                actionsPopover.getByTestId("clone-button"),
              ).toHaveCount(0);
              await expect(
                actionsPopover.getByTestId("archive-button"),
              ).toHaveCount(0);

              await expect(page.getByText("Revert", { exact: true })).toHaveCount(
                0,
              );
            });

            test("should not preselect the most recently visited dashboard", async ({
              page,
              mb,
            }) => {
              await openQuestionActions(page);
              await page.getByTestId("add-to-dashboard-button").click();

              await expect(
                entityPickerModal(page)
                  .getByText(/Orders in a dashboard/)
                  .locator("xpath=ancestor-or-self::a[1]"),
              ).toHaveAttribute("data-disabled", "true");

              // before visiting the dashboard, we don't have any history
              await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
              await visitQuestion(page, ORDERS_QUESTION_ID);

              await openQuestionActions(page);
              await page.getByTestId("add-to-dashboard-button").click();

              await expect(
                entityPickerModal(page)
                  .getByText(/Orders in a dashboard/)
                  .locator("xpath=ancestor-or-self::a[1]"),
              ).toHaveAttribute("data-disabled", "true");
            });
          });
        }
      }
    });
  }
});

test.describe("question moving", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await visitQuestion(page, ORDERS_QUESTION_ID);
  });

  test("should move a question between collections", async ({ page }) => {
    await expect(
      appBar(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    await openQuestionActions(page);
    await popover(page).getByTestId("move-button").click();
    const update = waitForCardUpdate(page, ORDERS_QUESTION_ID);
    await pickEntity(page, {
      path: ["Our analytics", "First collection", "Second collection"],
      select: true,
    });
    const response = await update;
    expect(response.status()).toBe(200);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Question moved to Second collection" }),
    ).toBeVisible();
    await expect(
      appBar(page).getByText("Second collection", { exact: true }),
    ).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  test("should show an error when moving a question fails", async ({ page }) => {
    await page.route(
      (url) => url.pathname === `/api/card/${ORDERS_QUESTION_ID}`,
      async (route) => {
        if (route.request().method() !== "PUT") {
          return route.continue();
        }
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Sorry buddy, only cool kids in this collection",
          }),
        });
      },
    );

    await expect(
      appBar(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    await openQuestionActions(page);
    await popover(page).getByTestId("move-button").click();
    await pickEntity(page, {
      path: ["Our analytics", "First collection", "Second collection"],
      select: true,
    });
    await expect(
      modal(page).getByText("Sorry buddy, only cool kids in this collection", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("send snowplow question events", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should send event when clicking `Turn into a model`", async ({
    page,
    mb,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(mb, {
      event: "turn_into_model_clicked",
    });
  });
});
