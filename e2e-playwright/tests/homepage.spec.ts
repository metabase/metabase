/**
 * Port of e2e/test/scenarios/onboarding/home/homepage.cy.spec.js.
 *
 * Covers the home page: sample-DB x-rays + suggestion sidebar (zoom in/out/
 * related, "Save this"), user-database x-rays, recent/popular items, the
 * qbnewb-modal keyboard dismiss, the asset-loading-error alert, and the custom
 * homepage flows (admin setting + home-page CTA, redirect/toast behaviour).
 *
 * Port notes:
 * - Snowplow is stubbed to no-ops (porting rule 6): reset/enable/expect become
 *   no-ops; the real UI actions they guarded are kept. New helpers live in
 *   support/homepage.ts; everything else is imported read-only.
 * - Cypress `beforeEach` registered response aliases and waited later; under
 *   Playwright the wait is registered right before the triggering navigation
 *   (porting rule 2) via the waitFor* factories in support/homepage.ts.
 * - findByText string args are exact matches (rule 1). `.first()` is added on
 *   text that can legitimately appear more than once on the page.
 * - The SQLite tests use the built-in sqlite driver + the repo-root
 *   `resources/sqlite-fixture.db` file (the slot backend runs from REPO_ROOT),
 *   so they are NOT infra-gated — no external DB needed.
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import { signInViaCookie, visitHomeAndWaitForXray } from "../support/ai-controls";
import { getProfileLink } from "../support/command-palette";
import { dashboardHeader, editBar } from "../support/dashboard";
import { dashboardGrid } from "../support/drillthroughs";
import { createDashboard } from "../support/factories";
import { expect, test } from "../support/fixtures";
import {
  addSqliteDatabase,
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  getDatabaseFields,
  pinItem,
  resetSnowplow,
  stubXrayCandidates,
  waitForCardQuery,
  waitForCollectionItems,
  waitForDashboardGet,
  waitForPopularItems,
  waitForRecentItems,
  waitForXrayCandidates,
  waitForXrayDashboard,
} from "../support/homepage";
import { entityPickerModal } from "../support/notebook";
import { undoToast } from "../support/metrics";
import { ADMIN_PERSONAL_COLLECTION_ID, signInWithCachedSession } from "../support/permissions";
import { ORDERS_BY_YEAR_QUESTION_ID, ORDERS_DASHBOARD_ID, USERS } from "../support/sample-data";
import {
  icon,
  main,
  modal,
  navigationSidebar,
  newButton,
  openNavigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const { admin } = USERS;

/** Port of `cy.wait("@putSettings")` (PUT /api/setting or /api/setting/:key). */
function waitForPutSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/setting"),
  );
}

test.describe("scenarios > home > homepage", () => {
  test.describe("after setup", () => {
    test.beforeEach(async ({ mb }) => {
      await resetSnowplow();
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await enableTracking();
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    test("should display x-rays for the Sample Database", async ({ page }) => {
      await visitHomeAndWaitForXray(page);

      const homePage = page.getByTestId("home-page");
      await expect(
        homePage.getByText(
          "Try out these sample x-rays to see what Metabase can do.",
          { exact: true },
        ),
      ).toBeVisible();

      const ordersXray = waitForXrayDashboard(page);
      await homePage.getByRole("link", { name: /Orders/ }).first().click();
      await ordersXray;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "table",
        triggered_from: "homepage",
      });

      const complementary = page.getByRole("complementary");
      await expect(
        complementary.getByRole("heading", { name: "More X-rays" }),
      ).toBeVisible();
      const zoomIn = waitForXrayDashboard(page);
      await complementary
        .getByRole("heading", { name: "Zoom in", exact: true })
        .locator("..")
        .getByText("Source fields", { exact: true })
        .click();
      await zoomIn;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "zoom-in",
        triggered_from: "suggestion_sidebar",
      });

      await expect(
        complementary.getByRole("heading", { name: "More X-rays" }),
      ).toBeVisible();
      const zoomOut = waitForXrayDashboard(page);
      await complementary
        .getByRole("heading", { name: "Zoom out", exact: true })
        .locator("..")
        .getByText("People", { exact: true })
        .click();
      await zoomOut;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "zoom-out",
        triggered_from: "suggestion_sidebar",
      });

      await expect(
        complementary.getByRole("heading", { name: "More X-rays" }),
      ).toBeVisible();
      const related = waitForXrayDashboard(page);
      await complementary
        .getByRole("heading", { name: "Related", exact: true })
        .locator("..")
        .getByText("Orders", { exact: true })
        .click();
      await related;

      await expectUnstructuredSnowplowEvent({
        event: "x-ray_clicked",
        event_detail: "related",
        triggered_from: "suggestion_sidebar",
      });

      // Wait for the x-ray dashboard to actually be ready before saving: once
      // its parameters are synced into the URL the query string is non-empty,
      // which is the reliable "dashboard is ready" signal (see upstream note).
      await expect
        .poll(() => new URL(page.url()).search)
        .not.toBe("");

      const header = page.getByTestId("automatic-dashboard-header");
      await header.getByRole("button", { name: "Save this" }).click();

      // Assert the save succeeded via the resulting UI (a "Saved" button + a
      // "See it" link), not the POST — the request wait flaked upstream.
      await expect(header.getByText("See it", { exact: true })).toBeVisible();
      await expect(header.getByText("Saved", { exact: true })).toBeVisible();

      await expectUnstructuredSnowplowEvent({ event: "x-ray_saved" });
    });

    test("should display x-rays for a user database", async ({ mb, page }) => {
      const sqliteId = await addSqliteDatabase(mb.api);
      const fields = await getDatabaseFields(mb.api, sqliteId);
      const num = fields.NUMBER_WITH_NULLS?.NUM;
      expect(num, "NUMBER_WITH_NULLS.NUM field id").toBeTruthy();

      // Set the semantic type of the num field to Category, else no X-rays
      // would be computed.
      await mb.api.put(`/api/field/${num}`, {
        semantic_type: "type/Category",
        has_field_values: "none",
      });

      await visitHomeAndWaitForXray(page);

      await expect(
        page.getByText("Here are some explorations of", { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /sqlite/ }).first(),
      ).toBeVisible();

      const xray = waitForXrayDashboard(page);
      await page.getByText("Number With Nulls", { exact: true }).click();
      await xray;

      await expect(page.getByText("More X-rays", { exact: true })).toBeVisible();
    });

    test("homepage should not flicker when syncing databases and showing xrays", async ({
      mb,
      page,
    }) => {
      await addSqliteDatabase(mb.api, "sqlite", { waitForSync: false });

      // Mark the second database as still-syncing and hold the response ~1s,
      // so the repeated "no loading indicator" assertion has a real window.
      await page.route(
        (url) => new URL(url.href).pathname === "/api/database",
        async (route) => {
          const request = route.request();
          const response = await fetch(request.url(), {
            headers: await request.allHeaders(),
          });
          const body = (await response.json()) as {
            data: { initial_sync_status?: string }[];
          };
          if (body.data[1]) {
            body.data[1].initial_sync_status = "incomplete";
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.fulfill({
            status: response.status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        },
      );

      await visitHomeAndWaitForXray(page);

      const homePage = page.getByTestId("home-page");
      await expect(homePage.getByTestId("loading-indicator")).toHaveCount(0);

      // Port of H.repeatAssertion: the loading indicator must never reappear
      // while the databases finish syncing.
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await expect(homePage.getByTestId("loading-indicator")).toHaveCount(0);
        await page.waitForTimeout(400);
      }
    });

    test("should allow switching between multiple schemas for x-rays", async ({
      mb,
      page,
    }) => {
      await addSqliteDatabase(mb.api, "sqlite", { waitForSync: false });
      await stubXrayCandidates(page);

      await page.goto("/");
      await expect(
        page.getByText(/Here are some explorations of the/).first(),
      ).toBeVisible();
      await expect(page.getByTestId("xray-schema-name")).toHaveText("public");
      await expect(page.getByRole("link", { name: /sqlite/ }).first()).toBeVisible();
      await expect(page.getByText("Orders", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("People", { exact: true })).toHaveCount(0);

      await page.getByTestId("xray-schema-name").click();
      await page.getByRole("option", { name: "private", exact: true }).click();
      await expect(page.getByTestId("xray-schema-name")).toHaveText("private");
      await expect(page.getByText("People", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Orders", { exact: true })).toHaveCount(0);
    });
  });

  test.describe("after content creation", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("default");
      await mb.signInAsAdmin();
    });

    test("should display recent items", async ({ mb, page }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        page.getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();

      const recents = waitForRecentItems(page);
      await page.goto("/");
      await recents;
      await expect(
        page.getByText("Pick up where you left off", { exact: true }),
      ).toBeVisible();

      const dashboard = waitForDashboardGet(page);
      await page.getByText("Orders in a dashboard", { exact: true }).first().click();
      await dashboard;
      await expect(page.getByText("Orders", { exact: true }).first()).toBeVisible();
    });

    test("should be able to dismiss qbnewq modal using keyboard (metabase#44754)", async ({
      mb,
      page,
    }) => {
      const randomUser = {
        email: "random@metabase.test",
        password: "12341234",
      };

      // We've already dismissed qbnewb modal for all existing users — create a
      // fresh admin so the modal shows.
      const userResponse = await mb.api.post("/api/user", randomUser);
      const { id } = (await userResponse.json()) as { id: number };
      await mb.api.put(`/api/user/${id}`, { is_superuser: true });
      await signInViaCookie(
        page,
        mb.api,
        mb.baseUrl,
        randomUser.email,
        randomUser.password,
      );

      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      const qbnewbModal = modal(page);
      await expect(qbnewbModal).toBeVisible();
      await expect(qbnewbModal).toContainText(
        "It's okay to play around with saved questions",
      );

      const modalDismiss = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/user\/\d+\/modal\/qbnewb$/.test(
            new URL(response.url()).pathname,
          ),
      );
      // Park the mouse so a hover-tooltip can't swallow the Escape (wave-9).
      await page.mouse.move(0, 0);
      await page.keyboard.press("Escape");
      await modalDismiss;
      await expect(modal(page)).toHaveCount(0);
    });

    // TODO: popular items endpoint is currently broken in OSS. Re-enable test
    // once the endpoint has been fixed. Gated on the pro-self-hosted token
    // (audit-app feature), which the jar activates.
    test.describe("EE", () => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
      );

      test("should display popular items for a new user", async ({ mb, page }) => {
        // Setting this so displaying popular items for new users works (needs
        // the audit-app feature enabled by the token).
        await mb.api.activateToken("pro-self-hosted");

        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
        await expect(
          page.getByText("Orders in a dashboard", { exact: true }).first(),
        ).toBeVisible();
        await mb.signOut();

        await mb.signInAsNormalUser();
        const popular = waitForPopularItems(page);
        await page.goto("/");
        await popular;
        await expect(
          page.getByText("Here are some popular dashboards", { exact: true }),
        ).toBeVisible();

        const dashboard = waitForDashboardGet(page);
        await page
          .getByText("Orders in a dashboard", { exact: true })
          .first()
          .click();
        await dashboard;
        await expect(page.getByText("Orders", { exact: true }).first()).toBeVisible();
      });
    });

    test("should not show pinned questions in recent items when viewed in a collection", async ({
      mb,
      page,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(
        page.getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();

      const collectionItems1 = waitForCollectionItems(page);
      await page.goto("/collection/root");
      await collectionItems1;
      const collectionItems2 = waitForCollectionItems(page);
      const cardQuery = waitForCardQuery(page);
      await pinItem(page, "Orders, Count");
      await collectionItems2;
      await cardQuery;

      const recents = waitForRecentItems(page);
      await page.goto("/");
      await recents;
      await expect(
        page.getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();
      await expect(page.getByText("Orders, Count", { exact: true })).toHaveCount(0);
    });

    test("should show an alert if applications assets are not served", async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      // Break the app-main script tag in the served index.html to force an
      // asset-load error (the onerror handler console.errors the bad src).
      await page.route(
        (url) => new URL(url.href).pathname === "/",
        async (route) => {
          const request = route.request();
          const response = await fetch(request.url(), {
            headers: await request.allHeaders(),
          });
          const body = (await response.text()).replace(
            'src="app/dist/app-main',
            'src="bad-link.js',
          );
          await route.fulfill({
            status: response.status,
            contentType: "text/html; charset=utf-8",
            body,
          });
        },
      );

      await page.goto("/");
      await expect
        .poll(() => consoleErrors.some((e) => /Could not download asset/.test(e)))
        .toBe(true);
      await expect
        .poll(() => consoleErrors.some((e) => /bad-link\.js/.test(e)))
        .toBe(true);
    });
  });
});

test.describe("scenarios > home > custom homepage", () => {
  test.describe("setting custom homepage", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should give you the option to set a custom home page in settings", async ({
      page,
    }) => {
      await page.goto("/admin/settings/general");

      const homepageSetting = page.getByTestId("homepage-setting");
      await expect(
        homepageSetting.getByRole("radio", { name: "Default Metabase home" }),
      ).toBeChecked();
      let putSettings = waitForPutSettings(page);
      await homepageSetting.getByRole("radio", { name: "Dashboard" }).check();
      await putSettings;

      await page
        .getByTestId("custom-homepage-dashboard-setting")
        .getByRole("button")
        .click();

      await entityPickerModal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();

      await expect(
        undoToast(page).getByText("Changes saved", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByTestId("custom-homepage-dashboard-setting"),
      ).toContainText("Orders in a dashboard");

      // Switching back to Default Metabase home hides the dashboard picker but
      // keeps the persisted id.
      await page.goto("/admin/settings/general");

      await expect(
        homepageSetting.getByRole("radio", { name: "Dashboard" }),
      ).toBeChecked();
      putSettings = waitForPutSettings(page);
      await homepageSetting
        .getByRole("radio", { name: "Default Metabase home" })
        .check();
      await putSettings;

      await expect(
        undoToast(page).getByText("Changes saved", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByTestId("custom-homepage-dashboard-setting"),
      ).toHaveCount(0);

      putSettings = waitForPutSettings(page);
      await homepageSetting.getByRole("radio", { name: "Dashboard" }).check();
      await putSettings;

      await expect(
        page.getByTestId("custom-homepage-dashboard-setting"),
      ).toContainText("Orders in a dashboard");

      // goToMainApp: open the app switcher and pick "Main app".
      await getProfileLink(page).click();
      await popover(page).getByText("Main app", { exact: true }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      // A page refresh should redirect to the dashboard homepage too.
      await page.goto("/");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      await page.getByLabel("Edit dashboard").click();
      await expect(
        editBar(page).getByText(
          "You're editing this dashboard. Remember that this dashboard is set as homepage.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should give you the option to set a custom home page using home page CTA", async ({
      mb,
      page,
    }) => {
      const nested1 = await mb.api.post("/api/collection", {
        name: "Personal nested Collection",
        description: "nested 1 level",
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      });
      const { id: nested1Id } = (await nested1.json()) as { id: number };
      const nested2 = await mb.api.post("/api/collection", {
        name: "Personal nested nested Collection",
        description: "nested 2 levels",
        parent_id: nested1Id,
      });
      const { id: nested2Id } = (await nested2.json()) as { id: number };
      await createDashboard(mb.api, {
        name: "nested dash",
        collection_id: nested2Id,
      });

      await page.goto("/");
      await main(page).getByText("Customize", { exact: true }).click();

      const customizeModal = modal(page);
      await expect(
        customizeModal.getByRole("button", { name: "Done" }),
      ).toBeDisabled();
      await customizeModal.getByText("Pick a dashboard", { exact: true }).click();

      const picker = entityPickerModal(page);
      // Personal collections have been removed from the picker.
      await expect(picker.getByText("First collection", { exact: true })).toBeVisible();
      await expect(picker.getByText(/personal collection/)).toHaveCount(0);

      // Child dashboards of personal collections do not appear in search.
      const search = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/search",
      );
      const searchInput = picker.getByPlaceholder(/search/i);
      await searchInput.click();
      await searchInput.pressSequentially("das");
      await searchInput.press("Enter");
      await search;
      await expect(
        picker.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(picker.getByText("nested dash", { exact: true })).toHaveCount(0);

      await picker.getByText("Orders in a dashboard", { exact: true }).click();

      await modal(page).getByRole("button", { name: "Done" }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      const status = page.getByRole("status");
      await expect(
        status.getByText("This dashboard has been set as your homepage.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        status.getByText("You can change this in Admin > Settings > General.", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("custom homepage set", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.updateSetting("custom-homepage", true);
      await mb.api.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
    });

    test("should not flash the homescreen before redirecting (#37089)", async ({
      page,
    }) => {
      await page.route(
        (url) =>
          new URL(url.href).pathname === `/api/dashboard/${ORDERS_DASHBOARD_ID}`,
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.continue();
        },
      );

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Loading...", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Loading...", exact: true }),
      ).toHaveCount(0, { timeout: 5000 });

      // Once the loading header is gone we are no longer on the home page.
      await expect(page.getByTestId("home-page")).toHaveCount(0);
      await expect.poll(() => page.url()).toContain("/dashboard/");
    });

    test("should redirect you if you do not have permissions for set dashboard", async ({
      context,
      page,
    }) => {
      await signInWithCachedSession(context, "nocollection");
      await page.goto("/");
      await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    });

    test("should not show you a toast after it has been dismissed", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(
        page
          .getByRole("status")
          .getByText(/Your admin has set this dashboard as your homepage/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Got it" }).click();

      // Let the dashboard load.
      await expect(
        dashboardHeader(page).getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();

      // Internal state was updated: navigating Home keeps the dashboard.
      await navigationSidebar(page).getByText("Home", { exact: true }).click();
      await expect(
        dashboardHeader(page).getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("undo-list")
          .getByText(/Your admin has set this dashboard as your homepage/),
      ).toHaveCount(0);

      // On refresh, the proper settings are given (no toast).
      await page.goto("/");
      await expect(
        dashboardHeader(page).getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("undo-list")
          .getByText(/Your admin has set this dashboard as your homepage/),
      ).toHaveCount(0);
    });

    test("should only show one toast on login", async ({ mb, page }) => {
      await mb.signOut();
      await page.goto("/auth/login");
      const email = page.getByLabel("Email address");
      await expect(email).toBeFocused();
      await email.fill(admin.email);
      await page.getByLabel("Password").fill(admin.password);
      await page.getByRole("button", { name: /sign in/i }).click();

      await expect(
        page
          .getByRole("status")
          .getByText(/Your admin has set this dashboard as your homepage/),
      ).toHaveCount(1);
    });

    test("should show the default homepage if the dashboard was archived (#31599)", async ({
      mb,
      page,
    }) => {
      const trashResponse = await mb.api.get("/api/collection/trash");
      const trash = (await trashResponse.json()) as { id: number };
      const getCollection = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/collection/${trash.id}`,
      );

      // Archive the dashboard.
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await dashboardHeader(page).getByLabel("Move, trash, and more…").click();
      await popover(page).getByText("Move to trash", { exact: true }).click();
      await modal(page).getByText("Move to trash", { exact: true }).click();
      await getCollection;

      // Navigate to home.
      await openNavigationSidebar(page);
      await navigationSidebar(page).getByText("Home", { exact: true }).click();
      await expect(
        main(page).getByText("We're a little lost...", { exact: true }),
      ).toHaveCount(0);
      await expect(
        main(page).getByText("Customize", { exact: true }),
      ).toBeVisible();
    });

    test("should not redirect when already on the dashboard homepage (metabase#43800)", async ({
      page,
    }) => {
      let metadataCount = 0;
      let dashCardQueryCount = 0;
      page.on("response", (response) => {
        const pathname = new URL(response.url()).pathname;
        if (
          new RegExp(
            `^/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata$`,
          ).test(pathname)
        ) {
          metadataCount += 1;
        }
        if (
          new RegExp(
            `^/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/\\d+/card/\\d+/query$`,
          ).test(pathname)
        ) {
          dashCardQueryCount += 1;
        }
      });

      await page.goto("/");
      await expect(dashboardGrid(page).getByTestId("loading-indicator")).toHaveCount(
        0,
      );

      const logo = page.getByTestId("main-logo-link");
      await logo.click();
      await logo.click();
      const home = navigationSidebar(page).getByText("Home", { exact: true });
      await home.click();
      await home.click();

      await expect(main(page).getByText(/Something.s gone wrong/)).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      expect(metadataCount).toBe(1);
      expect(dashCardQueryCount).toBe(1);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    });

    test("should not load the homepage dashboard when visiting another dashboard directly (metabase#43800)", async ({
      mb,
      page,
    }) => {
      let dashboardGetCount = 0;
      let metadataCount = 0;
      page.on("response", (response) => {
        if (response.request().method() !== "GET") {
          return;
        }
        const pathname = new URL(response.url()).pathname;
        if (/^\/api\/dashboard\/\d+$/.test(pathname)) {
          dashboardGetCount += 1;
        }
        if (/^\/api\/dashboard\/\d+\/query_metadata$/.test(pathname)) {
          metadataCount += 1;
        }
      });

      const dashboardName = "Test Dashboard";
      const dashboard = await createDashboard(mb.api, { name: dashboardName });
      await visitDashboard(page, mb.api, dashboard.id);

      await expect(
        dashboardHeader(page).getByText(dashboardName, { exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(dashboardGetCount).toBe(1);
      expect(metadataCount).toBe(1);
    });
  });
});

test.describe("scenarios > setup", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should send snowplow events through admin settings", async ({ page }) => {
    await page.goto("/admin/settings/general");
    const putSettings = waitForPutSettings(page);
    await page
      .getByTestId("homepage-setting")
      .getByRole("radio", { name: "Dashboard" })
      .check();
    await putSettings;

    await page
      .getByTestId("custom-homepage-dashboard-setting")
      .getByRole("button")
      .click();

    await entityPickerModal(page)
      .getByText("Orders in a dashboard", { exact: true })
      .click();

    await expect(
      undoToast(page).getByText("Changes saved", { exact: true }).first(),
    ).toBeVisible();

    await expectUnstructuredSnowplowEvent({
      event: "homepage_dashboard_enabled",
      source: "admin",
    });
  });

  test("should send snowplow events through homepage", async ({ page }) => {
    await page.goto("/");
    await main(page).getByText("Customize", { exact: true }).click();
    await modal(page).getByText("Pick a dashboard", { exact: true }).click();

    await entityPickerModal(page)
      .getByText("Orders in a dashboard", { exact: true })
      .click();
    await modal(page).getByText("Done", { exact: true }).click();

    await expectUnstructuredSnowplowEvent({
      event: "homepage_dashboard_enabled",
      source: "homepage",
    });
  });

  test("should track when 'New' button is clicked", async ({ page }) => {
    await page.goto("/");

    // From the app bar.
    await newButton(page).click();
    await expect(page.getByRole("menu", { name: /new/i })).toBeVisible();
    await expectUnstructuredSnowplowEvent({
      event: "new_button_clicked",
      triggered_from: "app-bar",
    });

    // Track closing the button as well.
    await newButton(page).click();
    await expect(page.getByRole("menu", { name: /new/i })).toHaveCount(0);
    await expectUnstructuredSnowplowEvent(
      {
        event: "new_button_clicked",
        triggered_from: "app-bar",
      },
      2,
    );

    // From the empty collection.
    await navigationSidebar(page)
      .getByText("Your personal collection", { exact: true })
      .click();
    const emptyState = page.getByTestId("collection-empty-state");
    await expect(
      emptyState.getByText("This collection is empty", { exact: true }),
    ).toBeVisible();
    await emptyState.getByText("New", { exact: true }).click();

    await expect(page.getByRole("menu", { name: /new/i })).toBeVisible();
    await expectUnstructuredSnowplowEvent({
      event: "new_button_clicked",
      triggered_from: "empty-collection",
    });
  });

  test("should track when a 'New' button's menu item is clicked", async ({
    page,
  }) => {
    await page.goto("/");

    await newButton(page).click();
    await page
      .getByRole("menu", { name: /new/i })
      .getByText("Dashboard", { exact: true })
      .click();
    await expect(
      page.getByTestId("new-dashboard-modal").getByRole("dialog"),
    ).toBeVisible();
    await expectUnstructuredSnowplowEvent({
      event: "new_button_item_clicked",
      triggered_from: "dashboard",
    });

    await page
      .getByTestId("new-dashboard-modal")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(page.getByTestId("new-dashboard-modal")).toHaveCount(0);

    await navigationSidebar(page)
      .getByText("Your personal collection", { exact: true })
      .click();
    const emptyState = page.getByTestId("collection-empty-state");
    await expect(
      emptyState.getByText("This collection is empty", { exact: true }),
    ).toBeVisible();
    await emptyState.getByText("New", { exact: true }).click();

    await page
      .getByRole("menu", { name: /new/i })
      .getByText("Dashboard", { exact: true })
      .click();
    await expect(
      page.getByTestId("new-dashboard-modal").getByRole("dialog"),
    ).toBeVisible();
    await expectUnstructuredSnowplowEvent(
      {
        event: "new_button_item_clicked",
        triggered_from: "dashboard",
      },
      2,
    );
  });
});
