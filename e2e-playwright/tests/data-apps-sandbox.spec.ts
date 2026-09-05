import type { Page } from "@playwright/test";

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

// Port of e2e/test/scenarios/data-apps/sandbox.cy.spec.ts.
//
// `H.activateToken("bleeding-edge")` -> `mb.api.activateToken("bleeding-edge")`
// (grants the `data-apps` premium feature; requires the EE build + token).
// The describe is gated on that token (PORTING rule 7). No `cy.wait`/intercept
// aliases in the original beyond `mockDataApp`, which is ported as `page.route`
// registered before the navigation that triggers the fetches.

test.describe("scenarios > data apps > sandbox & isolation", () => {
  test.skip(
    !resolveToken("bleeding-edge"),
    "Requires MB_ALL_FEATURES_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test.describe("sandboxing", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;
    const BLOCKED_URL = "https://blocked.data-app.test/ping";

    test("blocks disallowed APIs and cross-origin fetch, but permits allowed_hosts", async ({
      page,
      mb,
    }) => {
      // The allowed host is stubbed with a CORS header so the sandbox's real
      // network call resolves; the blocked host is never intercepted because
      // the sandbox rejects it before it reaches the network.
      await page.route(ALLOWED_URL, (route) =>
        route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*" },
          body: "pong",
        }),
      );

      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        allowedHosts: [ALLOWED_ORIGIN],
        testEnv: {
          ...TEST_ENV,
          sandbox: { allowedUrl: ALLOWED_URL, blockedUrl: BLOCKED_URL },
        },
      });

      await openDataApp(page, mb.baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      await iframe
        .getByRole("link", { name: "Sandbox", exact: true })
        .click();

      // A blocked DOM API throws synchronously inside the sandbox.
      await expect(iframe.getByTestId("probe-script")).toHaveText("blocked", {
        timeout: 30000,
      });

      // A fetch to a host not in allowed_hosts is rejected by the sandbox.
      await expect(iframe.getByTestId("blocked-fetch-result")).toContainText(
        "not in allowed_hosts",
        { timeout: 30000 },
      );

      // A fetch to a host in allowed_hosts reaches the (stubbed) network.
      await expect(iframe.getByTestId("allowed-fetch-result")).toHaveText(
        "ok: 200",
        { timeout: 30000 },
      );
    });
  });

  test.describe("sandbox breadth", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;
    const BLOCKED_URL = "https://blocked.data-app.test/ping";

    // Method/constructor calls the sandbox distortion replaces with a throwing
    // shim. (Getter-only reads like `localStorage` aren't intercepted, so they
    // aren't asserted here.)
    const BLOCKED_PROBE_IDS = [
      "script",
      "window-open",
      "alert",
      "history",
      "keydown-listener",
      "websocket",
      "sendbeacon",
    ];

    test("blocks a broad set of dangerous globals, strips innerHTML, and gates XHR", async ({
      page,
      mb,
    }) => {
      await page.route(ALLOWED_URL, (route) =>
        route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*" },
          body: "pong",
        }),
      );

      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        allowedHosts: [ALLOWED_ORIGIN],
        testEnv: {
          ...TEST_ENV,
          sandbox: {
            allowedUrl: ALLOWED_URL,
            blockedUrl: BLOCKED_URL,
            xhrAllowedUrl: ALLOWED_URL,
            xhrBlockedUrl: BLOCKED_URL,
          },
        },
      });

      // Deep-link straight to the sandboxing page (the app router starts there).
      await visitDataAppRoute(page, mb.baseUrl, "sandboxing");
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);

      for (const id of BLOCKED_PROBE_IDS) {
        await expect(iframe.getByTestId(`probe-${id}`)).toHaveText("blocked", {
          timeout: 30000,
        });
      }

      await expect(iframe.getByTestId("probe-innerhtml")).toHaveText(
        "stripped",
      );

      // XHR obeys the same allowlist as fetch.
      await expect(iframe.getByTestId("blocked-xhr-result")).toContainText(
        "blocked",
      );
      await expect(iframe.getByTestId("allowed-xhr-result")).toHaveText(
        "ok: 200",
        { timeout: 30000 },
      );
    });
  });

  test.describe("isolation", () => {
    const openIsolationPage = async (page: Page, baseUrl: string) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });
      await openDataApp(page, baseUrl, APP_NAME);
      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      await expect(
        iframe.getByRole("heading", { name: "Orders overview", exact: true }),
      ).toBeVisible();
      await iframe
        .getByRole("link", { name: "Isolation", exact: true })
        .click();
    };

    test("keeps the app's CSS inside the iframe", async ({ page, mb }) => {
      await openIsolationPage(page, mb.baseUrl);

      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      // The injected <style> applies to the app's own document.
      await expect(iframe.getByTestId("css-injected")).toHaveText("ok");
      await expect(iframe.getByTestId("isolation-css-probe")).toHaveCSS(
        "color",
        "rgb(0, 128, 0)",
      );

      // The aggressive `body` rule injected in the iframe does not reach the
      // parent document.
      await expect(page.locator("body")).not.toHaveCSS(
        "background-color",
        "rgb(0, 128, 0)",
      );
    });

    test("keeps the app's JS globals out of the parent realm (near-membrane)", async ({
      page,
      mb,
    }) => {
      await openIsolationPage(page, mb.baseUrl);

      const iframe = dataAppIframe(page, APP_DISPLAY_NAME);
      // The app set the global in its own realm and read it back.
      await expect(iframe.getByTestId("js-marker")).toHaveText("in-app");

      // The parent window never sees the app's global.
      const parentHasMarker = await page.evaluate(
        () => "__DATA_APP_ISOLATION_MARKER__" in window,
      );
      expect(parentHasMarker).toBe(false);
    });
  });

  test.describe("iframe security headers", () => {
    test("serves the embed document with the expected CSP + framing headers", async ({
      mb,
    }) => {
      const res = await mb.api.get(`/embed/apps/${APP_NAME}`, {
        failOnStatusCode: false,
      });
      const headers = res.headers();
      const csp = String(headers["content-security-policy"] ?? "");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toContain("'unsafe-eval'");
      expect(String(headers["x-frame-options"] ?? "")).toMatch(/sameorigin/i);
    });

    test("renders the app in a locked-down sandboxed iframe", async ({
      page,
      mb,
    }) => {
      await mockDataApp(page, APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      await openDataApp(page, mb.baseUrl, APP_NAME);
      const sandboxAttr = await page
        .locator(`iframe[title="${APP_DISPLAY_NAME}"]`)
        .getAttribute("sandbox");
      expect(sandboxAttr).toContain("allow-scripts");
    });
  });
});
