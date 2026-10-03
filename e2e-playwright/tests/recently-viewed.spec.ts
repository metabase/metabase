/**
 * Playwright port of e2e/test/scenarios/search/recently-viewed.cy.spec.js
 *
 * Covers the recently-viewed list (/api/activity/recents) as surfaced in the
 * search dropdown (full-app embedding, so keyboard nav can be exercised), the
 * entity picker's "recents" tab, and the verified badge in the command
 * palette's recents list (EE).
 *
 * Port notes:
 * - The first two describes' search-dropdown tests run in full-app embedding
 *   mode (as upstream did, "because this is testing keyboard navigation"). The
 *   app runs inside a real iframe here (visitFullAppEmbeddingUrl); all app
 *   interactions go through the returned FrameLocator, network waits stay on
 *   the page (PORTING search rule). Always pass mb.baseUrl (rule 8).
 * - cy.intercept("/api/activity/recents?*") + cy.wait("@recent") → a
 *   waitForResponse registered before the triggering navigation/click, awaited
 *   after (rule 2).
 * - assertRecentlyViewedItem / advanceServerClockBy live in
 *   support/recently-viewed.ts; everything else is imported read-only.
 * - cy.get("body").trigger("keydown", { key }) → a synthetic dispatchEvent on
 *   the iframe body (mirrors Cypress's synthetic trigger; the recents keyboard
 *   handler is a global listener).
 * - `.should("have.text", …)` is a full-text exact match → toHaveText.
 * - EE describe is gated on the pro-self-hosted token (the jar activates it).
 */
import { expect, test } from "../support/fixtures";
import {
  commandPalette,
  openCommandPalette,
} from "../support/command-palette";
import { openPeopleTable } from "../support/ad-hoc-question";
import { resolveToken } from "../support/api";
import { createModerationReview } from "../support/search-filters";
import { createCollection } from "../support/search";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import {
  embedFrame,
  getSearchBar,
  visitFullAppEmbeddingUrl,
} from "../support/search";
import { entityPickerModal } from "../support/notebook";
import {
  advanceServerClockBy,
  assertRecentlyViewedItem,
} from "../support/recently-viewed";
import {
  icon,
  newButton,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

test.describe("search > recently viewed", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openPeopleTable(page);
    await expect(page.getByText("Address", { exact: true }).first()).toBeVisible();

    // "Orders" question
    await advanceServerClockBy(mb.api, 100);
    await visitQuestion(page, ORDERS_QUESTION_ID);

    // "Orders in a dashboard" dashboard
    await advanceServerClockBy(mb.api, 100);
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await expect(
      page.getByText("Product ID", { exact: true }).first(),
    ).toBeVisible();

    // Because this is testing keyboard navigation, these tests run in embedded
    // mode.
    const recent = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/activity/recents",
    );
    const embed = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      baseUrl: mb.baseUrl,
      qs: { top_nav: true, search: true },
    });
    await recent;

    await getSearchBar(embed).click();
    await expect(embed.getByTestId("loading-indicator")).toHaveCount(0);
  });

  test("shows list of recently viewed items", async ({ page }) => {
    const embed = page.frameLocator("#embed");
    await assertRecentlyViewedItem(embed, 0, "Orders in a dashboard", "Dashboard");
    await assertRecentlyViewedItem(embed, 1, "Orders", "Question");
    await assertRecentlyViewedItem(embed, 2, "People", "Table");
  });

  test("allows to select an item from keyboard", async ({ page }) => {
    const embed = page.frameLocator("#embed");
    await expect(
      embed
        .getByTestId("recents-list-container")
        .getByText("Recently viewed", { exact: true }),
    ).toBeVisible();

    const body = embed.locator("body");
    await body.dispatchEvent("keydown", { key: "ArrowDown" });
    await body.dispatchEvent("keydown", { key: "ArrowDown" });
    await body.dispatchEvent("keydown", { key: "Enter" });

    await expect
      .poll(() => new URL(embedFrame(page).url()).pathname)
      .toMatch(/\/question\/\d+-orders$/);
  });

  test("shows up-to-date list of recently viewed items after another page is visited (metabase#36868)", async ({
    page,
    mb,
  }) => {
    const embed = page.frameLocator("#embed");

    // The recents list is served by an RTK-Query cached endpoint. The
    // beforeEach already opened the search bar and awaited /api/activity/recents,
    // so re-clicking it here reuses the warm cache and fires NO new request —
    // Cypress's cy.wait was satisfied retroactively by that past response, but
    // Playwright's waitForResponse only sees future ones. Don't wait for it; the
    // retrying toHaveText assertions gate the (already-loaded) list instead.
    await getSearchBar(embed).click();
    await expect(embed.getByTestId("loading-indicator")).toHaveCount(0);

    await assertRecentlyViewedItem(embed, 0, "Orders in a dashboard", "Dashboard");
    await assertRecentlyViewedItem(embed, 1, "Orders", "Question");
    await assertRecentlyViewedItem(embed, 2, "People", "Table");

    const dataset = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/dataset",
    );

    await advanceServerClockBy(mb.api, 100);
    await embed.getByTestId("recently-viewed-item-title").nth(2).click();
    await dataset;

    // Clicking the People row logs a new view, which invalidates the recents
    // cache; reopening the search bar refetches and the list re-orders. The
    // retrying assertion waits for that update (People moves to the top).
    await getSearchBar(embed).click();
    await assertRecentlyViewedItem(embed, 0, "People", "Table");
  });
});

test.describe("Recently Viewed > Entity Picker", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await page.goto("/");
  });

  test("shows recently created collection in entity picker", async ({
    page,
    mb,
  }) => {
    await createCollection(mb.api, { name: "My Fresh Collection" });

    await newButton(page).click();
    await popover(page).getByText("Dashboard", { exact: true }).click();
    await page.getByTestId("collection-picker-button").click();

    const picker = entityPickerModal(page);
    await picker.getByText("Select a collection", { exact: true }).click();
    await expect(
      picker.getByText("My Fresh Collection", { exact: true }),
    ).toBeVisible();
  });

  test("shows recently visited dashboard in entity picker", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await icon(queryBuilderHeader(page), "ellipsis").click();
    await popover(page).getByText("Add to dashboard", { exact: true }).click();

    const picker = entityPickerModal(page);
    await picker
      .getByText("Add this question to a dashboard", { exact: true })
      .click();
    await picker.getByText("Our analytics", { exact: true }).click();
    await picker.getByText("Orders in a dashboard", { exact: true }).click();
    await picker.getByRole("button", { name: "Select", exact: true }).click();

    await expect
      .poll(() => page.url())
      .toContain(`/dashboard/${ORDERS_DASHBOARD_ID}-`);
    await expect(
      page
        .getByTestId("dashboard-header-container")
        .getByText(/You're editing this dashboard/),
    ).toBeVisible();
  });
});

test.describe("search > recently viewed > enterprise features", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await createModerationReview(mb.api, {
      status: "verified",
      moderated_item_id: ORDERS_QUESTION_ID,
      moderated_item_type: "card",
    });

    await visitQuestion(page, ORDERS_QUESTION_ID);

    await expect(
      icon(page.getByTestId("qb-header-left-side"), "verified"),
    ).toBeVisible();
  });

  test("should show verified badge in the 'Recently viewed' list (metabase#18021)", async ({
    page,
  }) => {
    await openCommandPalette(page);

    await expect(
      icon(commandPalette(page), "verified_filled"),
    ).toBeVisible();
  });
});
