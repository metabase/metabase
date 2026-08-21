/**
 * Playwright port of
 * e2e/test/scenarios/organization/official-collections.cy.spec.js
 *
 * Marking a collection "official": the official badge/icon across lists,
 * breadcrumbs and search; the admin-only collection-type toggle; and the
 * search boost. This is an EE feature gated on the `official_collections`
 * token feature.
 *
 * Port notes:
 * - EE/token (PORTING rule 7): the "premium token" / "token expired" describes
 *   activate `pro-self-hosted` in beforeEach and are gated on resolveToken.
 * - The "without a token" API gate asserts the raw 402 response — status,
 *   statusText and a deep-include of the partial premium-feature error body
 *   (toMatchObject). Registered via api.post({ failOnStatusCode: false }).
 * - `cy.icon("official_collection" | "folder")` → the class-based `icon()`
 *   helper. `.should("exist"/"not.exist")` → toHaveCount checks; the navbar's
 *   `.should("be.visible")` is an ANY-match → `.filter({visible:true}).first()`.
 * - All spec-local helpers live in support/official-collections.ts.
 */
import { resolveToken } from "../support/api";
import { openCollectionMenu } from "../support/collections-core";
import { startNewCollectionFromSidebar } from "../support/command-palette";
import { test, expect } from "../support/fixtures";
import {
  COLLECTION_NAME,
  assertHasCollectionTypeInput,
  assertNoCollectionTypeInput,
  assertNoCollectionTypeOption,
  assertSidebarIcon,
  changeCollectionTypeTo,
  createAndOpenOfficialCollection,
  getCollectionActions,
  getPartialPremiumFeatureError,
  openCollection,
  testOfficialBadgePresence,
  testOfficialQuestionBadgeInRegularDashboard,
} from "../support/official-collections";
import { icon, modal, popover } from "../support/ui";

test.describe("official collections", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("without a token", () => {
    test("should not be able to manage collection's authority level", async ({
      page,
      mb,
    }) => {
      // Gate the API
      const response = await mb.api.post(
        "/api/collection",
        {
          name: "Wannabe Official Collection",
          authority_level: "official",
        },
        { failOnStatusCode: false },
      );
      expect(response.status()).toBe(402);
      expect(response.statusText()).toBe("Payment Required");
      const body = await response.json();
      expect(body).toMatchObject(
        getPartialPremiumFeatureError("Official Collections"),
      );

      // Gate the UI
      await page.goto("/collection/root");

      await startNewCollectionFromSidebar(page);
      await assertNoCollectionTypeInput(page);
      await modal(page).getByLabel("Close", { exact: true }).click();

      await openCollection(page, "First collection");
      await openCollectionMenu(page);
      await assertNoCollectionTypeOption(page);
    });
  });

  test.describe("premium token with paid features", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should be able to manage collection authority level", async ({
      page,
    }) => {
      await page.goto("/collection/root");

      await createAndOpenOfficialCollection(page, { name: COLLECTION_NAME });
      await expect(
        page.getByTestId("official-collection-marker"),
      ).toBeVisible();
      await assertSidebarIcon(page, COLLECTION_NAME, "official_collection");

      await changeCollectionTypeTo(page, "regular");
      await expect(
        page.getByTestId("official-collection-marker"),
      ).toHaveCount(0);
      await assertSidebarIcon(page, COLLECTION_NAME, "folder");

      await changeCollectionTypeTo(page, "official");
      await expect(
        page.getByTestId("official-collection-marker"),
      ).toBeVisible();
      await assertSidebarIcon(page, COLLECTION_NAME, "official_collection");
    });

    test("displays official badge throughout the application", async ({
      page,
      mb,
    }) => {
      await testOfficialBadgePresence(page, mb.api);
    });

    test("should display a badge next to official questions in regular dashboards", async ({
      page,
      mb,
    }) => {
      await testOfficialQuestionBadgeInRegularDashboard(page, mb.api);
    });

    test("should not see collection type field if not admin", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await page.goto("/collection/root");

      await openCollection(page, "First collection");

      await startNewCollectionFromSidebar(page);
      await assertNoCollectionTypeInput(page);
      await modal(page).getByLabel("Close", { exact: true }).click();

      await openCollectionMenu(page);
      await assertNoCollectionTypeOption(popover(page));
    });

    test("should be able to manage collection authority level for personal collections and their children (metabase#30236)", async ({
      page,
    }) => {
      await page.goto("/collection/root");

      await openCollection(page, "Your personal collection");
      await expect(
        icon(getCollectionActions(page), "ellipsis"),
      ).not.toHaveCount(0);
      await icon(getCollectionActions(page), "ellipsis").click();

      await expect(
        popover(page).getByText("Make collection official", { exact: true }),
      ).toBeVisible();

      await startNewCollectionFromSidebar(page);
      await assertHasCollectionTypeInput(page);
      await modal(page)
        .getByPlaceholder("My new fantastic collection")
        .fill("Personal collection child");
      await modal(page).getByText("Create", { exact: true }).click();

      await openCollection(page, "Personal collection child");

      await expect(
        icon(getCollectionActions(page), "ellipsis"),
      ).not.toHaveCount(0);
      await icon(getCollectionActions(page), "ellipsis").click();
      await expect(
        popover(page).getByText("Make collection official", { exact: true }),
      ).toBeVisible();

      await startNewCollectionFromSidebar(page);
      await assertHasCollectionTypeInput(page);
      await modal(page).getByLabel("Close", { exact: true }).click();
    });
  });

  test.describe("token expired or removed", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should not display official collection icon anymore", async ({
      page,
      mb,
    }) => {
      await testOfficialBadgePresence(page, mb.api, false);
    });

    test("should display questions belonging to previously official collections as regular in regular dashboards", async ({
      page,
      mb,
    }) => {
      await testOfficialQuestionBadgeInRegularDashboard(page, mb.api, false);
    });
  });
});
