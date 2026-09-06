/**
 * Playwright port of e2e/test/scenarios/data-apps/admin.cy.spec.ts
 *
 * Two tiers:
 * - "admin management" (EE): needs the `data-apps` feature, granted by the
 *   `bleeding-edge` (MB_ALL_FEATURES_TOKEN) token. Gated with
 *   test.skip(!resolveToken("bleeding-edge"), ...).
 * - "upsell (OSS)" (@OSS): asserts the OSS build's upsell. The spike backend is
 *   the EE jar, so these skip on isOssBackend (PORTING wave-5 @OSS gotcha).
 *
 * Port notes:
 * - H.mockDataApp → support/data-apps.ts mockDataApp (builds the kitchen-sink
 *   fixture bundle, serves it + the /api/apps metadata via page.route). Only the
 *   happy-path test builds a bundle; the banner test uses bare page.route stubs.
 * - cy.intercept("POST","/api/dataset").as("dataAppQuery") + cy.wait → a
 *   waitForResponse(POST /api/dataset) registered BEFORE openDataApp, awaited
 *   after (rule 2). The /api/dataset call originates inside the sandboxed
 *   iframe; waitForResponse is context-level and sees it.
 * - findByRole/findByText string args → exact (rule 1); /regex/ stays a regex.
 * - H.main() → support/ui.ts main(page) (`<main>`).
 */
import { resolveToken } from "../support/api";
import { isOssBackend } from "../support/admin";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppIframe,
  mockDataApp,
  openDataApp,
} from "../support/data-apps";
import { expect, test } from "../support/fixtures";
import { main } from "../support/ui";

test.describe("scenarios > data apps > admin management", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires the bleeding-edge (MB_ALL_FEATURES_TOKEN) token, which grants the data-apps premium feature",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    await mb.api.activateToken("bleeding-edge");
  });

  test("Happy Path: lists a data app and renders it in its sandboxed iframe with real SDK data", async ({
    page,
    mb,
  }) => {
    await mockDataApp(page, APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    await page.goto("/admin/settings/apps");
    const listLink = page.getByRole("link", {
      name: APP_DISPLAY_NAME,
      exact: true,
    });
    await listLink.scrollIntoViewIfNeeded();
    await expect(listLink).toBeVisible();

    // Register the dataset wait BEFORE the navigation that triggers it (rule 2).
    const datasetResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/dataset" &&
        response.request().method() === "POST",
    );

    await openDataApp(page, mb.baseUrl, APP_NAME);

    const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
    await expect(
      iframe.getByRole("heading", { name: "Orders overview", exact: true }),
    ).toBeVisible();

    await expect(iframe.getByTestId("orders-count")).toHaveText(/^\d+$/, {
      timeout: 30_000,
    });

    await expect(iframe.getByText("Subtotal", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // The iframe's query requests must be attributed to the data app, so
    // query_execution analytics record which app ran them (EMB-2088).
    const response = await datasetResponse;
    const headers = response.request().headers();
    expect(headers["x-metabase-client"]).toBe("data-app");
    expect(headers["x-metabase-client-identifier"]).toBe(APP_NAME);
  });

  test("dismisses the promo banner and keeps it hidden across a reload", async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === "/api/apps/repo-status",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configured: true }),
        }),
    );
    await page.route(
      (url) => url.pathname === "/api/apps",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        }),
    );

    await page.goto("/admin/settings/apps");

    await expect(main(page).getByText(/AI-generated React apps/)).toBeVisible();

    // The dismissal is a real user-key-value write; wait on the PUT (rule 2).
    const ackBanner = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/user-key-value/namespace/user_acknowledgement/key/data-apps-admin-settings-banner" &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await ackBanner;

    await expect(main(page).getByText(/AI-generated React apps/)).toHaveCount(0);

    // The dismissal persists, so a reload keeps it hidden.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Data apps", exact: true }),
    ).toBeVisible();
    await expect(main(page).getByText(/AI-generated React apps/)).toHaveCount(0);
  });
});

test.describe("scenarios > data apps > upsell (OSS)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // No token: the upsell only renders on an OSS build (no `data-apps`
    // feature). The spike backend is the EE jar, so this describe skips there
    // (PORTING @OSS gotcha — gate on isOssBackend).
    test.skip(
      !(await isOssBackend(mb.api)),
      "OSS-only: the data-apps upsell renders only when the data-apps feature is unavailable",
    );
  });

  test("shows the data-apps upsell instead of the management UI", async ({
    page,
  }) => {
    await page.goto("/admin/settings/apps");

    await expect(
      main(page).getByText("Build apps on your data", { exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText("Try for free", { exact: true }),
    ).toBeVisible();
  });

  test("marks the Data apps settings nav item with an upsell gem", async ({
    page,
  }) => {
    await page.goto("/admin/settings/apps");

    const navItem = page.getByRole("link", { name: /Data apps/ });
    await expect(navItem.getByTestId("upsell-gem")).toBeVisible();
  });
});
