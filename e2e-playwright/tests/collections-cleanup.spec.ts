/**
 * Playwright port of e2e/test/scenarios/collections/cleanup.cy.spec.js
 *
 * Port notes:
 * - The "clean up collection modal" describe is gated on snowplow in Cypress
 *   (resetSnowplow / enableTracking / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent). Those run real assertions here, backed by
 *   the per-slot collector via ../support/snowplow; the clean-up UI flow inside
 *   is ported for real too.
 * - The whole "ee" describe needs the pro-self-hosted feature, so it is gated
 *   with resolveToken (PORTING rule 7). The jar activates it.
 * - The "oss" test asserts the feature is ABSENT on an OSS build; it is gated
 *   with isOssBackend and SKIPS on our EE jar (PORTING wave-5 gotcha).
 * - Cypress intercept aliases (cy.intercept + cy.wait) for the stale-items GET
 *   become page.waitForResponse registered before the trigger (PORTING rule 2);
 *   the two response mutations (is_sample flag / 500 error) become page.route.
 * - New spec-local helpers live in support/collections-cleanup.ts.
 */
import dayjs from "dayjs";

import type { APIResponse, Route } from "@playwright/test";

import { isOssBackend } from "../support/admin";
import { resolveToken } from "../support/api";
import { undo } from "../support/dashboard-parameters";
import {
  assertNoPagination,
  assertStaleItemCount,
  bulkCreateQuestions,
  cleanUpModal,
  closeCleanUpModal,
  collectionMenu,
  createCollectionViaApi,
  emptyState,
  errorState,
  getCollectionActions,
  makeItemStale,
  makeItemsStale,
  moveToTrash,
  pagination,
  recursiveFilter,
  seedMainTestData,
  selectAllItems,
  selectCleanThingsUpCollectionAction,
  setDateFilter,
} from "../support/collections-cleanup";
import { test, expect } from "../support/fixtures";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { visitCollection } from "../support/question-new";
import { FIRST_COLLECTION_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import { main, modal, navigationSidebar, popover } from "../support/ui";

const sixMonthsAgo = () =>
  dayjs().startOf("day").subtract(6, "months").format("YYYY-MM-DD");

/** The stale-items GET the modal fires: /api/ee/stale/<id>?... (query required,
 * matching the Cypress `/api/ee/stale/**?**` alias). */
const isStaleItemsRequest = (url: URL) =>
  url.pathname.startsWith("/api/ee/stale/") && url.search.length > 0;

test.describe("scenarios > collections > clean up", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("oss", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("feature should not be available in OSS", async ({ page, mb }) => {
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS-only test — requires an OSS build",
      );

      await visitCollection(page, FIRST_COLLECTION_ID);
      await collectionMenu(page).click();
      await expect(
        popover(page).getByText("Clear out unused items", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("ee", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.describe("action menu", () => {
      test("should show in proper contexts", async ({ page, mb }) => {
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        // should not show in custom analytics collections
        await visitCollection(page, "root");
        await navigationSidebar(page)
          .getByText("Usage analytics", { exact: true })
          .click();
        await navigationSidebar(page)
          .getByText("Custom reports", { exact: true })
          .click();
        await collectionMenu(page).click();
        await expect(
          popover(page).getByText("Clear out unused items", { exact: true }),
        ).toHaveCount(0);

        // should show in a normal collection that user has write access to
        await visitCollection(page, FIRST_COLLECTION_ID);
        await collectionMenu(page).click();
        await expect(
          popover(page).getByText("Clear out unused items", { exact: true }),
        ).toBeVisible();

        // trashing the collection removes its actions menu
        await popover(page).getByText("Move to trash", { exact: true }).click();
        await modal(page).getByText("Move to trash", { exact: true }).click();
        await expect(page.getByTestId("archive-banner")).toBeVisible();
        await expect(getCollectionActions(page)).toHaveCount(0);

        // should not show in empty collections
        const empty = await createCollectionViaApi(mb.api, { name: "Empty" });
        await visitCollection(page, empty.id);
        await collectionMenu(page).click();
        await expect(
          popover(page).getByText("Clear out unused items", { exact: true }),
        ).toHaveCount(0);

        // should recommend the option when there are stale items
        const withStale = await createCollectionViaApi(mb.api, {
          name: "collection with stale items",
        });
        const [staleQuestion] = await bulkCreateQuestions(mb.api, 1, {
          collection_id: withStale.id,
        });
        await makeItemsStale(mb.api, [staleQuestion.id], "card", sixMonthsAgo());
        await visitCollection(page, withStale.id);
        await collectionMenu(page).click();
        await expect(
          popover(page).getByRole("menuitem", {
            name: /Clear out unused items/,
          }),
        ).toContainText("Recommended");

        // should not show in sample collections (trip is_sample flag)
        const fakeSample = await createCollectionViaApi(mb.api, {
          name: "Fake sample collection",
        });
        const [sampleQuestion] = await bulkCreateQuestions(mb.api, 1, {
          collection_id: fakeSample.id,
        });
        await makeItemsStale(
          mb.api,
          [sampleQuestion.id],
          "card",
          sixMonthsAgo(),
        );
        await page.route(
          (url) => url.pathname === `/api/collection/${fakeSample.id}`,
          async (route: Route) => {
            const response: APIResponse = await route.fetch();
            const body = (await response.json()) as Record<string, unknown>;
            body.is_sample = true;
            await route.fulfill({ response, json: body });
          },
        );
        await visitCollection(page, fakeSample.id);
        await collectionMenu(page).click();
        await expect(
          popover(page).getByText("Clear out unused items", { exact: true }),
        ).toHaveCount(0);
      });

      test("should not show to users who do not have write permissions to a collection", async ({
        page,
        mb,
      }) => {
        await mb.signIn("readonly");
        await visitCollection(page, FIRST_COLLECTION_ID);
        await expect(collectionMenu(page)).toHaveCount(0);
      });
    });

    test.describe("clean up collection modal", () => {
      test.beforeEach(async ({ mb }) => {
        await resetSnowplow(mb);
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await enableTracking(mb);
      });

      test.afterEach(async ({ mb }) => {
        await expectNoBadSnowplowEvents(mb);
      });

      test("should be able to clean up stale items", async ({ page, mb }) => {
        const seedData = await seedMainTestData(mb.api);
        const firstAlphabeticalName = "Bulk dashboard 1";
        const lastAlphabeticalName = "Bulk question 9";

        // should be able to navigate to clean up modal
        await visitCollection(page, seedData.collection.id);
        await selectCleanThingsUpCollectionAction(page);
        await expect(page).toHaveURL(/cleanup/);

        // should render all items of current collection
        await assertStaleItemCount(page, seedData.totalStaleItemCount);

        // should be able to filter to fewer items
        await setDateFilter(page, "1 year");
        await assertNoPagination(page);

        // should be able to recursively show stale items
        await setDateFilter(page, "6 months");
        await recursiveFilter(page).click({ force: true });
        await assertStaleItemCount(page, seedData.recursiveTotalItemCount);

        // pagination should work as expected
        await expect(
          pagination(page).getByText(/1 - 10/),
        ).toBeVisible();
        await expect(
          cleanUpModal(page).getByText(lastAlphabeticalName, { exact: true }),
        ).toHaveCount(0);
        await pagination(page).getByTestId("next-page-btn").click();
        await expect(
          pagination(page).getByText(/11 - 19/),
        ).toBeVisible();
        await expect(
          cleanUpModal(page).getByText(lastAlphabeticalName, { exact: true }),
        ).toBeVisible();
        await pagination(page).getByTestId("previous-page-btn").click();
        await expect(
          pagination(page).getByText(/1 - 10/),
        ).toBeVisible();
        await pagination(page).getByTestId("next-page-btn").click();
        await expect(
          pagination(page).getByText(/11 - 19/),
        ).toBeVisible();

        // pagination should reset when the date filter changes
        await setDateFilter(page, "3 months");
        await expect(
          pagination(page).getByText(/1 - 10/),
        ).toBeVisible();
        await pagination(page).getByTestId("next-page-btn").click();
        await expect(
          pagination(page).getByText(/11 - 19/),
        ).toBeVisible();

        // pagination should reset when the recursive filter changes
        await recursiveFilter(page).click({ force: true });
        await expect(
          pagination(page).getByText(/1 - 10/),
        ).toBeVisible();
        await recursiveFilter(page).click({ force: true });

        // should be able to sort items by name and last used at columns
        const table = cleanUpModal(page).locator("table");
        await expect(
          table.getByText(firstAlphabeticalName, { exact: true }),
        ).toBeVisible();
        await expect(
          table.getByText(lastAlphabeticalName, { exact: true }),
        ).toHaveCount(0);
        await table.getByText("Name", { exact: true }).click();
        await expect(
          table.getByText(firstAlphabeticalName, { exact: true }),
        ).toHaveCount(0);
        await expect(
          table.getByText(lastAlphabeticalName, { exact: true }),
        ).toBeVisible();
        await table.getByText("Name", { exact: true }).click();
        await expect(
          table.getByText(firstAlphabeticalName, { exact: true }),
        ).toBeVisible();
        await expect(
          table.getByText(lastAlphabeticalName, { exact: true }),
        ).toHaveCount(0);

        // should be able to move stale items to the trash
        await recursiveFilter(page).click({ force: true });
        await assertStaleItemCount(page, seedData.totalStaleItemCount);

        await selectAllItems(page);
        await moveToTrash(page);
        await assertNoPagination(page);

        await expectUnstructuredSnowplowEvent(
          mb,
          (event) =>
            event.event === "moved-to-trash" &&
            (event.event_detail === "dashboard" ||
              event.event_detail === "question") &&
            typeof event.target_id === "number" &&
            event.triggered_from === "cleanup_modal" &&
            typeof event.duration_ms === "number" &&
            event.result === "success",
          10,
        );

        // cutoff_date is relative to the current date, so just assert it is a
        // string — the Iglu schema validates its format.
        await expectUnstructuredSnowplowEvent(
          mb,
          (event) =>
            event.event === "stale_items_archived" &&
            event.collection_id === seedData.collection.id &&
            event.total_items_archived === 10 &&
            typeof event.cutoff_date === "string",
        );

        await undo(page);
        await assertStaleItemCount(page, seedData.totalStaleItemCount);

        await selectAllItems(page);
        await moveToTrash(page);
        await assertNoPagination(page);

        await selectAllItems(page);
        await moveToTrash(page);

        await closeCleanUpModal(page);
        await expect(page).not.toHaveURL(/cleanup/);

        // collection items view should reflect the actions taken
        await expect(main(page).locator("tr")).toHaveCount(
          seedData.notStaleItemCount +
            1 + // child collection
            1, // header row
        );

        await makeItemStale(mb.api, ORDERS_QUESTION_ID, "card");

        await navigationSidebar(page)
          .getByText("Our analytics", { exact: true })
          .click();
        await selectCleanThingsUpCollectionAction(page);
        await expect(page).toHaveURL(/cleanup/);

        await selectAllItems(page);
        await moveToTrash(page);

        // should no longer show alert if user has used the clean up feature
        await closeCleanUpModal(page);

        // Stale items in Our Analytics are marked with a null collection id.
        await expectUnstructuredSnowplowEvent(
          mb,
          (event) =>
            event.event === "stale_items_archived" &&
            event.collection_id === null &&
            event.total_items_archived === 1 &&
            typeof event.cutoff_date === "string",
        );
      });

      test("show empty and error states correctly", async ({ page, mb }) => {
        // should handle empty state — visit a collection w/ items but no stale ones
        const collection = await createCollectionViaApi(mb.api, {
          name: "Not empty w/ not stale items",
        });
        await bulkCreateQuestions(mb.api, 2, { collection_id: collection.id });

        await visitCollection(page, collection.id);

        // should render a table w/ contents
        await expect(main(page).getByText("Type", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Name", { exact: true })).toBeVisible();

        const staleWait = page.waitForResponse((response) =>
          isStaleItemsRequest(new URL(response.url())),
        );
        await selectCleanThingsUpCollectionAction(page);
        await staleWait;

        await expect(emptyState(page)).toBeVisible();

        // should handle error state
        await page.route(
          (url) => isStaleItemsRequest(url),
          (route: Route) => route.fulfill({ status: 500, body: "" }),
        );

        const errorWait = page.waitForResponse((response) =>
          isStaleItemsRequest(new URL(response.url())),
        );
        await setDateFilter(page, "1 year");
        await errorWait;
        await expect(errorState(page)).toBeVisible();
      });
    });
  });
});
