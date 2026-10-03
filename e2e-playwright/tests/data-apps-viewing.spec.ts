import { resolveToken } from "../support/api";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  dataAppIframe,
  mockDataApp,
  openDataApp,
  visitDataAppRoute,
} from "../support/data-apps";
import { expect, test } from "../support/fixtures";
import { main } from "../support/ui";

// Port of e2e/test/scenarios/data-apps/viewing.cy.spec.ts.
//
// `H.activateToken("bleeding-edge")` -> `mb.api.activateToken("bleeding-edge")`;
// the describe is gated on that token (PORTING rule 7). `cy.signIn("nodata")`
// -> `mb.signIn("nodata")` — the harness's signIn already uses the throwaway
// context for users without a cached snapshot session, so no POST leaks into
// `mb.api`'s cookie jar. `cy.location(...).should("eq")` -> `expect.poll` on the
// pathname (retried URL assertion).

test.describe("scenarios > data apps > viewing & routing", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires MB_ALL_FEATURES_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test.describe("viewing permissions", () => {
    test("lets a non-admin open a data app by direct URL", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // A normal (non-admin) user has data access, so the app opens and renders
      // its data — the admin gate is only on *managing* apps, not viewing them.
      await mb.signInAsNormalUser();
      await openDataApp(page, mb.baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      await expect(iframe.getByTestId("orders-count")).toHaveText(/^\d+$/, {
        timeout: 30000,
      });
    });

    test("opens the app shell for a user without data access, but shows no data", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // The `nodata` user can open the app (viewing isn't gated), but the query
      // the app runs goes through the QP with the user's own permissions — with
      // no data access it resolves to no data (the fixture renders "—").
      await mb.signIn("nodata");
      await openDataApp(page, mb.baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      await expect(iframe.getByTestId("orders-count")).toHaveText("—", {
        timeout: 30000,
      });
    });

    test("shows a not-found state for a disabled or missing app", async ({
      page,
      mb,
    }) => {
      // No app with this slug exists, so the metadata endpoint really 404s and
      // the host renders a not-found state rather than a broken iframe — no mock.
      await openDataApp(page, mb.baseUrl, "does-not-exist");
      await expect(
        main(page).getByText("Data app not found", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("loading state", () => {
    test("keeps the loader up until the app's bundle has actually rendered", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
        bundleDelay: 2000,
      });

      await openDataApp(page, mb.baseUrl, APP_NAME);

      await expect(page.getByTestId("data-app-loading")).toBeVisible();

      await expect(page.getByTestId("data-app-loading")).toHaveCount(0, {
        timeout: 30000,
      });
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("internal routing", () => {
    test("mirrors internal route changes into the parent URL", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await openDataApp(page, mb.baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      // Navigate to a nested page using the exposed `DataAppLink`.
      await iframe.getByRole("link", { name: "Details", exact: true }).click();
      await expect(
        iframe.getByRole("heading", { name: "Order details", exact: true }),
      ).toBeVisible();
      // The app's own router moved, too — not just the page that rendered.
      await expect(iframe.getByTestId("current-pathname")).toHaveText(
        "/details",
      );

      // The iframe's client-side navigation is mirrored to the parent's URL bar
      // (via replaceState), so the top-level path reflects the nested route.
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/apps/${APP_NAME}/details`);
    });

    test("starts on the target page when deep-linked directly to a sub-route", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await visitDataAppRoute(page, mb.baseUrl, "details");
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Order details", exact: true }),
      ).toBeVisible();
      await expect(iframe.getByTestId("current-pathname")).toHaveText(
        "/details",
      );
    });

    test("navigates imperatively via useDataAppLocation().navigate", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await openDataApp(page, mb.baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      await iframe.getByTestId("navigate-to-details").click();
      await expect(
        iframe.getByRole("heading", { name: "Order details", exact: true }),
      ).toBeVisible();
      await expect(iframe.getByTestId("current-pathname")).toHaveText(
        "/details",
      );
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/apps/${APP_NAME}/details`);
    });
  });

  test.describe("host error / not-ready screens", () => {
    test("shows a themed host error screen when the bundle throws while rendering", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await visitDataAppRoute(page, mb.baseUrl, "throw");
      // The throw is caught in the iframe and reported to the parent, which
      // renders its themed failure screen in the host realm.
      await expect(
        main(page).getByText(/couldn.t be loaded/i),
      ).toBeVisible({ timeout: 30000 });
    });
  });
});
