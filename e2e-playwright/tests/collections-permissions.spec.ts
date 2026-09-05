/**
 * Playwright port of e2e/test/scenarios/collections/permissions.cy.spec.js
 *
 * Port notes:
 * - The Cypress spec iterates a PERMISSIONS map, but only the `curate` group
 *   (admin/normal/nodata) and the `view` group (readonly) produce runnable
 *   tests via onlyOn(); the `no` group (nocollection/nosql/none) has no
 *   matching onlyOn block, so nothing runs for those users. Ported as two
 *   explicit user lists rather than the runtime onlyOn filtering.
 * - `cy.signIn("nocollection")` targets a user outside the fixture's typed
 *   USERS map but present in the login cache — hence `as UserName` (mirrors
 *   collections.spec / documents.spec).
 * - The beforeEach `cy.intercept("GET","/api/search*").as("search")` is only
 *   awaited in the view-user #15281 test; ported there as a per-action
 *   waitForResponse (PORTING rule 2), dropped elsewhere.
 * - THIRD_COLLECTION_ID is derived by slug in Cypress ("obtain the ID
 *   programatically"); the snapshot pins it, so the exported constant is used.
 * - The #15281 test ran twice (routes "/" and "/collection/root") under one
 *   `it` title — Playwright rejects duplicate titles, so each carries its route
 *   in the title.
 * - The collection-permissions admin test needs the pro-self-hosted token (EE);
 *   gated with resolveToken (PORTING rule 7). The jar activates it.
 */
import type { UserName } from "../support/sample-data";

import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  archiveUnarchive,
  collectionRow,
  duplicate,
  move,
  personalCollectionName,
  pinItem,
  waitForCollectionGraph,
  waitForPermissionsGroups,
} from "../support/collections-permissions";
import { displaySidebarChildOf, openCollectionMenu } from "../support/collections-core";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { sidebar } from "../support/dashboard";
import { startNewNativeQuestion, typeInNativeEditor } from "../support/native-editor";
import { entityPickerModal } from "../support/notebook";
import { resolveToken } from "../support/api";
import {
  FIRST_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import {
  appBar,
  collectionTable,
  icon,
  main,
  modal,
  navigationSidebar,
  popover,
  queryBuilderHeader,
} from "../support/ui";

const CURATE_USERS = ["admin", "normal", "nodata"] as const;
const VIEW_USERS = ["readonly"] as const;

test.describe("collection permissions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("item management", () => {
    for (const user of CURATE_USERS) {
      test.describe(`curate access - ${user} user`, () => {
        test.beforeEach(async ({ mb }) => {
          await mb.signIn(user as UserName);
        });

        test.describe("create dashboard", () => {
          test("should offer to save dashboard to a currently opened collection", async ({
            page,
          }) => {
            await page.goto("/collection/root");
            await displaySidebarChildOf(page, "First collection");
            await navigationSidebar(page)
              .getByText("Second collection", { exact: true })
              .click();

            await icon(appBar(page), "add").click();
            await popover(page).getByText("Dashboard", { exact: true }).click();

            await expect(
              page
                .getByLabel(/Which collection/)
                .getByText("Second collection", { exact: true }),
            ).toBeVisible();
          });

          if (user === "admin") {
            test("should offer to save dashboard to root collection from a dashboard page (metabase#16832)", async ({
              page,
            }) => {
              await page.goto("/collection/root");
              await collectionTable(page)
                .getByText("Orders in a dashboard", { exact: true })
                .click();

              await icon(appBar(page), "add").click();
              await popover(page)
                .getByText("Dashboard", { exact: true })
                .click();

              await expect(
                page
                  .getByLabel(/Which collection/)
                  .getByText("Our analytics", { exact: true }),
              ).toBeVisible();
            });
          }
        });

        test.describe("pin", () => {
          test("pinning should work properly for both questions and dashboards", async ({
            page,
          }) => {
            await page.goto("/collection/root");
            // Assert that we're starting from a scenario with no pins
            await expect(page.getByTestId("pinned-items")).toHaveCount(0);

            await pinItem(page, "Orders in a dashboard");
            await expect(
              collectionTable(page).getByText("Orders in a dashboard", {
                exact: true,
              }),
            ).toHaveCount(0);

            await pinItem(page, "Orders, Count");
            await expect(
              collectionTable(page).getByText("Orders, Count", { exact: true }),
            ).toHaveCount(0);

            // Should see "pinned items" and items should be in that section
            const pinned = page.getByTestId("pinned-items");
            await expect(
              pinned.getByText("Orders in a dashboard", { exact: true }),
            ).toBeVisible();
            await expect(
              pinned.getByText("Orders, Count", { exact: true }),
            ).toBeVisible();
          });
        });

        test.describe("move", () => {
          test("should let a user move/undo move a question", async ({
            page,
          }) => {
            await move(page, "Orders");
          });

          test("should let a user move/undo move a dashboard", async ({
            page,
          }) => {
            await move(page, "Orders in a dashboard");
          });
        });

        test.describe("duplicate", () => {
          test("should be able to duplicate the dashboard without obstructions from the modal (metabase#15256)", async ({
            page,
          }) => {
            await duplicate(page, "Orders in a dashboard");
          });
        });

        test.describe("archive", () => {
          test("should be able to archive/unarchive question (metabase#15253)", async ({
            page,
          }) => {
            await archiveUnarchive(page, "Orders", "question");
          });

          test("should be able to archive/unarchive dashboard", async ({
            page,
          }) => {
            await archiveUnarchive(page, "Orders in a dashboard", "dashboard");
          });

          test("should be able to archive/unarchive model", async ({
            page,
            mb,
          }) => {
            test.skip(user === "nodata", "nodata cannot create a native model");
            await createNativeQuestion(mb.api, {
              name: "Model",
              type: "model",
              native: { query: "SELECT 1" },
            });
            await archiveUnarchive(page, "Model", "model");
          });

          test.describe("archive page", () => {
            test("should show archived items (metabase#15080, metabase#16617)", async ({
              page,
            }) => {
              await page.goto("/collection/root");
              await openCollectionItemMenu(page, "Orders");
              await popover(page)
                .getByText("Move to trash", { exact: true })
                .click();

              const toast = page.getByTestId("toast-undo");
              await expect(
                toast.getByText("Trashed question", { exact: true }),
              ).toBeVisible();
              await icon(toast, "close").click();

              await navigationSidebar(page)
                .getByText("Trash", { exact: true })
                .click();
              await expect
                .poll(() => new URL(page.url()).pathname)
                .toBe("/trash");
              await expect(
                page.getByText("Orders", { exact: true }).first(),
              ).toBeVisible();
            });
          });

          test.describe("collections", () => {
            test("shouldn't be able to archive/edit root or personal collection", async ({
              page,
            }) => {
              await page.goto("/collection/root");
              await expect(icon(page, "edit")).toHaveCount(0);
              await page
                .getByText("Your personal collection", { exact: true })
                .click();
              await expect(icon(page, "edit")).toHaveCount(0);
            });

            test("archiving sub-collection should redirect to its parent", async ({
              page,
            }) => {
              await page.goto(`/collection/${THIRD_COLLECTION_ID}`);

              await openCollectionMenu(page);
              await popover(page)
                .getByText("Move to trash", { exact: true })
                .click();

              const editWait = page.waitForResponse(
                (response) =>
                  response.request().method() === "PUT" &&
                  new URL(response.url()).pathname ===
                    `/api/collection/${THIRD_COLLECTION_ID}`,
              );
              await modal(page)
                .getByText("Move to trash", { exact: true })
                .click();
              await editWait;

              await expect(page.getByTestId("archive-banner")).toBeVisible();

              await expect(
                navigationSidebar(page).getByText("First collection", {
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                navigationSidebar(page).getByText("Second collection", {
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                navigationSidebar(page).getByText("Third collection", {
                  exact: true,
                }),
              ).toHaveCount(0);

              // While we're here, we can test unarchiving the collection as well
              await expect(
                page.getByText("Trashed collection", { exact: true }),
              ).toBeVisible();
              const editWait2 = page.waitForResponse(
                (response) =>
                  response.request().method() === "PUT" &&
                  new URL(response.url()).pathname ===
                    `/api/collection/${THIRD_COLLECTION_ID}`,
              );
              await page.getByText("Undo", { exact: true }).first().click();
              await editWait2;

              await expect(
                page.getByText("Sorry, you don’t have permission to see that.", {
                  exact: true,
                }),
              ).toHaveCount(0);
              await expect(page.getByTestId("archive-banner")).toHaveCount(0);

              // But unarchived collection is now visible in the sidebar
              await expect(
                navigationSidebar(page).getByText("Third collection", {
                  exact: true,
                }),
              ).toBeVisible();
            });

            test("visiting already archived collection by its ID shouldn't let you edit it (metabase#12489)", async ({
              page,
              mb,
            }) => {
              // Archive it
              await mb.api.put(`/api/collection/${THIRD_COLLECTION_ID}`, {
                archived: true,
              });

              // What happens if we visit the archived collection by its id?
              await page.goto(`/collection/${THIRD_COLLECTION_ID}`);

              await expect(
                page.getByTestId("collection-name-heading"),
              ).toContainText("Third collection");
              // Creating new sub-collection / changing permissions shouldn't be
              // possible (the root issue of #12489).
              await expect(
                page.getByTestId("collection-menu"),
              ).toHaveCount(0);
              await expect(icon(page, "edit")).toHaveCount(0);
            });

            test("abandoning archive process should keep you in the same collection (metabase#15289)", async ({
              page,
            }) => {
              await page.goto(`/collection/${THIRD_COLLECTION_ID}`);
              await openCollectionMenu(page);
              await popover(page)
                .getByText("Move to trash", { exact: true })
                .click();
              await modal(page).getByText("Cancel", { exact: true }).click();
              await expect
                .poll(() => new URL(page.url()).pathname)
                .toBe(`/collection/${THIRD_COLLECTION_ID}-third-collection`);
              await expect(
                page.getByTestId("collection-name-heading"),
              ).toContainText("Third collection");
            });
          });
        });
      });
    }

    for (const user of VIEW_USERS) {
      test.describe(`view access - ${user} user`, () => {
        test.beforeEach(async ({ mb }) => {
          await mb.signIn(user as UserName);
        });

        test("should not show pins or a helper text (metabase#20043)", async ({
          page,
        }) => {
          await page.goto("/collection/root");

          await expect(
            page.getByText("Orders in a dashboard", { exact: true }).first(),
          ).toBeVisible();
          await expect(icon(page, "pin")).toHaveCount(0);
        });

        test("should be offered to duplicate dashboard in collections they have `read` access to", async ({
          page,
        }) => {
          await page.goto("/collection/root");
          await openCollectionItemMenu(page, "Orders in a dashboard");
          await popover(page).getByText("Duplicate", { exact: true }).click();
          await expect(
            page.getByTestId("collection-picker-button"),
          ).toHaveText(personalCollectionName(user));
        });

        test("should not be able to use bulk actions on collection items (metabase#16490)", async ({
          page,
        }) => {
          await page.goto("/collection/root");

          const ordersRow = collectionRow(page, "Orders");
          await icon(ordersRow, "table2").hover();
          await expect(ordersRow.getByRole("checkbox")).toHaveCount(0);

          const dashboardRow = collectionRow(page, "Orders in a dashboard");
          await icon(dashboardRow, "dashboard").hover();
          await expect(dashboardRow.getByRole("checkbox")).toHaveCount(0);
        });

        for (const route of ["/", "/collection/root"]) {
          test(`should not be offered to save dashboard in collections they have \`read\` access to (metabase#15281) (from ${route})`, async ({
            page,
          }) => {
            await page.goto(route);
            await icon(appBar(page), "add").click();
            await popover(page).getByText("Dashboard", { exact: true }).click();

            // Coming from the root collection, the initial offered collection
            // will be "Our analytics" (read-only access)
            await modal(page)
              .getByText(personalCollectionName(user), { exact: true })
              .click();

            const picker = page.getByLabel("Select a collection", {
              exact: true,
            });
            await expect(
              picker.getByText("Read Only Tableton's Personal Collection", {
                exact: true,
              }),
            ).toBeVisible();
            // Test will fail on this step first
            await expect(
              picker.getByText("First collection", { exact: true }),
            ).toHaveCount(0);

            // This is the second step that makes sure not even search returns
            // collections with read-only access. The picker's search input
            // debounces 300ms before firing GET /api/search; the Cypress
            // original typed "third{Enter}", but a real Enter here submits the
            // underlying create-dashboard form and unmounts the picker before
            // the debounce fires (cancelling the search). Register the wait,
            // type, and let the debounce fire — the Enter is not needed to
            // trigger the search and only races the assertion.
            const searchWait = page.waitForResponse(
              (response) =>
                response.request().method() === "GET" &&
                new URL(response.url()).pathname === "/api/search",
            );
            await picker
              .getByPlaceholder("Search…", { exact: true })
              .pressSequentially("third");
            await searchWait;

            await expect(picker.getByText(/Loading/i)).toHaveCount(0);
            await expect(
              picker.getByText("Third collection", { exact: true }),
            ).toHaveCount(0);
          });
        }
      });
    }
  });

  test("should offer to save items to 'Our analytics' if user has a 'curate' access to it", async ({
    page,
    mb,
  }) => {
    await mb.signIn("normal");

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from people");
    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();

    await expect(
      page
        .getByLabel(/Where do you want to save this/)
        .getByText("Our analytics", { exact: true }),
    ).toBeVisible();
  });

  test("should load the collection permissions admin pages", async ({
    page,
    mb,
  }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token (EE collection permissions)",
    );
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await page.goto("/admin/permissions/collections");
    await expect(
      main(page).getByText("Select a collection to see its permissions", {
        exact: true,
      }),
    ).toBeVisible();

    const graph1 = waitForCollectionGraph(page);
    const groups1 = waitForPermissionsGroups(page);
    await page.goto("/admin/permissions/collections/root");
    await Promise.all([graph1, groups1]);

    await expect(
      page
        .getByTestId("permissions-editor")
        .getByText("Permissions for Our analytics", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("permission-table")).toBeVisible();

    const graph2 = waitForCollectionGraph(page);
    const groups2 = waitForPermissionsGroups(page);
    await page.goto(`/admin/permissions/collections/${FIRST_COLLECTION_ID}`);
    await Promise.all([graph2, groups2]);
    await expect(
      page
        .getByTestId("permissions-editor")
        .getByText("Permissions for First collection", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("permission-table")).toBeVisible();

    await sidebar(page).getByText("Usage analytics", { exact: true }).click();
    await expect(
      page
        .getByTestId("permissions-editor")
        .getByText("Permissions for Usage analytics", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("permission-table")).toBeVisible();
  });

  test("should show the new collection button in a sidebar even to users without collection access", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nocollection" as UserName);
    await page.goto("/");

    const createButton = navigationSidebar(page).getByLabel(
      "Create a new collection",
      { exact: true },
    );
    await expect(createButton).toBeVisible();
    await createButton.click();

    const newCollectionModal = page.getByTestId("new-collection-modal");
    await newCollectionModal.getByLabel("Name", { exact: true }).fill("Foo");
    // The only possible location to save the new collection is this user's
    // personal collection
    await expect(
      newCollectionModal.getByTestId("collection-picker-button"),
    ).toContainText("No Collection Tableton's Personal Collection");

    const createWait = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/collection",
    );
    await newCollectionModal
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await createWait;

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/collection\/\d+-foo/);
  });
});
