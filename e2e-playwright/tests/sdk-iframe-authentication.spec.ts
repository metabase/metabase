import type { FrameLocator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID, USERS } from "../support/sample-data";
import {
  AUTH_PROVIDER_URL,
  assertEmbedTargetsThisSlot,
  getSignedJwtForUser,
  loadSdkIframeEmbedTestPage,
  mockAuthSsoEndpointForSamlAuthProvider,
  prepareSdkIframeEmbedTest,
  readApplicationNameFromEmbed,
  sdkErrorContainer,
  stubWindowOpenForSamlPopup,
  stubWindowOpenInert,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
  writeSlotMarker,
} from "../support/sdk-iframe";

/**
 * Port of e2e/test/scenarios/embedding/sdk-iframe-embedding/authentication.cy.spec.ts
 *
 * The proof-of-harness spec for `support/sdk-iframe.ts` — chosen because it is
 * the only spec in the tier that exercises every auth path (JWT provider, JWT
 * via a custom fetchRequestToken, SAML popup, API key, existing user session)
 * AND the non-localhost "production origin" case, which is the one that most
 * directly stresses the URL rewriting the slot model forces.
 *
 * Port notes:
 * - Every hardcoded `http://localhost:4000` in the original becomes
 *   `mb.baseUrl`. There were three distinct ones (script src, instanceUrl,
 *   test-page origin) plus two in `cy.intercept` matchers.
 * - `cy.visit("http://localhost:4000")` before the two production-origin
 *   tests ("restore the current page's domain") is dropped: it exists to reset
 *   Cypress's AUT origin between `cy.visit`s, which has no Playwright analogue.
 * - `cy.intercept(...).as()` + `cy.wait(@)` → `page.waitForResponse` armed
 *   before the navigation (PORTING.md rule 2). `cy.get("@sso.all")` (assert a
 *   request never happened) → a `page.on("request")` counter.
 * - Upstream's `onVisitPage(win)` mutation of `window.metabaseConfig` is done
 *   with an `insertHtml.beforeEmbed` script instead: it runs after the config
 *   script and before the custom elements, which is the same window, and it
 *   avoids an addInitScript ordering race.
 * - The JWT for the custom `fetchRequestToken` is signed in node up front
 *   rather than inside the browser (upstream bundles `jose` into the AUT).
 *   Same secret, same claims, 10-minute expiry.
 */

const ADDED_SLOT_ASSERTION =
  "STRENGTHENED vs upstream: proves the embed is on THIS slot's backend.";

test.describe("scenarios > embedding > sdk iframe embedding > authentication", () => {
  test.describe("jwtProviderUri", () => {
    test.beforeEach(async ({ page, mb }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
      });
    });

    test("should not skip the first auth request if jwtProviderUri is not given", async ({
      page,
      mb,
    }) => {
      const sso = waitForSso(page, mb.baseUrl, "GET");
      const ssoProvider = page.waitForResponse(
        (response) => response.url().startsWith(AUTH_PROVIDER_URL),
      );
      const tokenInSessionOut = waitForSso(page, mb.baseUrl, "POST");
      const getDashboard = page.waitForResponse(
        (response) =>
          /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname),
      );

      await visitCustomHtmlPage(
        page,
        mb,
        `
        <!DOCTYPE html>
          <html>
          <body>
            <script src="${mb.baseUrl}/app/embed.js" ></script>
            <script>
              function defineMetabaseConfig(settings) {
                window.metabaseConfig = settings;
              }
            </script>
            <script>
              defineMetabaseConfig({
                "instanceUrl": "${mb.baseUrl}",
              });
            </script>
            <metabase-dashboard dashboard-id='${ORDERS_DASHBOARD_ID}' />
          </body>
          </html>
            `,
      );

      await sso;
      await ssoProvider;
      await tokenInSessionOut;
      await getDashboard;

      await expect(
        embedFrame(page).getByText("Orders in a dashboard"),
      ).toBeVisible({ timeout: 40_000 });
    });

    test("should skip the first auth request if jwtProviderUri is given", async ({
      page,
      mb,
    }) => {
      // Upstream asserts `cy.get("@sso.all").should("have.length", 0)`, i.e.
      // the GET /auth/sso never happened. Count requests instead.
      let getSsoCount = 0;
      page.on("request", (request) => {
        if (
          request.method() === "GET" &&
          request.url().startsWith(`${mb.baseUrl}/auth/sso`)
        ) {
          getSsoCount += 1;
        }
      });

      const ssoProvider = page.waitForResponse((response) =>
        response.url().startsWith(AUTH_PROVIDER_URL),
      );
      const tokenInSessionOut = waitForSso(page, mb.baseUrl, "POST");
      const getDashboard = page.waitForResponse((response) =>
        /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname),
      );

      await visitCustomHtmlPage(
        page,
        mb,
        `
        <!DOCTYPE html>
          <html>
          <body>
            <script src="${mb.baseUrl}/app/embed.js" ></script>
            <script>
              function defineMetabaseConfig(settings) {
                window.metabaseConfig = settings;
              }
            </script>
            <script>
              defineMetabaseConfig({
                "instanceUrl": "${mb.baseUrl}",
                "jwtProviderUri": "${AUTH_PROVIDER_URL}?response=json",
              });
            </script>
            <metabase-dashboard dashboard-id='${ORDERS_DASHBOARD_ID}' />
          </body>
          </html>
            `,
      );

      await ssoProvider;
      await tokenInSessionOut;
      expect(getSsoCount).toBe(0);
      await getDashboard;

      await expect(
        embedFrame(page).getByText("Orders in a dashboard"),
      ).toBeVisible({ timeout: 40_000 });
    });
  });

  test("cannot login if no auth methods are enabled", async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: true,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await expect(sdkErrorContainer(frame)).toBeVisible({ timeout: 40_000 });
    await expect(sdkErrorContainer(frame)).toContainText(
      "SSO has not been enabled and/or configured",
    );
  });

  test("can use existing user session when useExistingUserSession is true", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: false,
    });

    // See ADDED_SLOT_ASSERTION. Written while still admin-authenticated.
    const marker = await writeSlotMarker(mb);

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { useExistingUserSession: true },
    });

    await assertDashboardLoaded(page, frame, dashCardQuery);

    // ADDED_SLOT_ASSERTION — two legs, see support/sdk-iframe.ts.
    await assertEmbedTargetsThisSlot(page, mb);
    expect(await readApplicationNameFromEmbed(page), ADDED_SLOT_ASSERTION).toBe(
      marker,
    );
  });

  test("cannot use existing user session when there is no session", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: true,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { useExistingUserSession: true },
    });

    // Upstream's `findByText(str)` is an exact match on a single element. Here
    // the message and its "Read more." link share one text container
    // ("Failed to authenticate… Read more."), so an exact match finds nothing.
    // Assert containment on the error container instead — same signal.
    await expect(sdkErrorContainer(frame)).toContainText(
      "Failed to authenticate using an existing Metabase user session.",
      { timeout: 40_000 },
    );

    await expect(
      frame.getByRole("link", { name: "Read more.", exact: true }),
    ).toHaveAttribute(
      "href",
      /https:\/\/www\.metabase\.com\/docs\/latest\/embedding\/authentication#configure-session-cookies-when-testing-locally/,
    );

    await expect(sdkErrorContainer(frame)).toBeVisible();
  });

  test("cannot use existing user session when useExistingUserSession is false", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: false,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { useExistingUserSession: false },
    });

    // When no auth methods are enabled and the existing user session is not
    // used, login must fail.
    await expect(sdkErrorContainer(frame)).toBeVisible({ timeout: 40_000 });
    await expect(sdkErrorContainer(frame)).toContainText(
      "SSO has not been enabled and/or configured",
    );
  });

  test("can login via JWT", async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["jwt"],
      signOut: true,
    });

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await assertDashboardLoaded(page, frame, dashCardQuery);
    await assertEmbedTargetsThisSlot(page, mb);
  });

  test("can login via JWT and a custom fetch request token function", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["jwt"],
      signOut: true,
    });

    const jwt = getSignedJwtForUser({ user: USERS.admin });

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      insertHtml: {
        beforeEmbed: `<script>
          window.metabaseConfig = {
            ...window.metabaseConfig,
            fetchRequestToken: async () => ({ jwt: ${JSON.stringify(jwt)} }),
          };
        </script>`,
      },
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await assertDashboardLoaded(page, frame, dashCardQuery);
  });

  test("shows error message if login via JWT and a custom fetch request token is failing", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["jwt"],
      signOut: true,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      insertHtml: {
        beforeEmbed: `<script>
          window.metabaseConfig = {
            ...window.metabaseConfig,
            fetchRequestToken: async () => ({ jwt: "" }),
          };
        </script>`,
      },
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await expect(
      sdkErrorContainer(frame).getByText(/Failed to fetch JWT token/),
    ).toBeAttached({ timeout: 40_000 });
  });

  test("can login via SAML", async ({ page, mb }) => {
    await mockAuthSsoEndpointForSamlAuthProvider(page, mb);
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: true,
    });
    await stubWindowOpenForSamlPopup(page);

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await assertDashboardLoaded(page, frame, dashCardQuery);
  });

  test("shows an error if the SAML login results in an invalid user", async ({
    page,
    mb,
  }) => {
    await mockAuthSsoEndpointForSamlAuthProvider(page, mb);
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: true,
    });
    await stubWindowOpenForSamlPopup(page, { isUserValid: false });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await expect(sdkErrorContainer(frame)).toBeVisible({ timeout: 40_000 });
    await expect(sdkErrorContainer(frame)).toContainText(
      "Failed to fetch the user, the session might be invalid.",
    );
  });

  test("shows an error if we are using an API key in production", async ({
    page,
    mb,
  }) => {
    const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    // A test page served from a non-localhost origin is what makes the SDK
    // treat this as "production".
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      origin: "http://example.com",
      metabaseConfig: { apiKey },
    });

    await expect(
      frame.getByText("Using an API key in production is not allowed.", {
        exact: true,
      }),
    ).toBeAttached({ timeout: 40_000 });
    await expect(
      page.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);
  });

  test("shows an error if we are using the existing user session in production", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: [],
      signOut: true,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      origin: "http://example.com",
      metabaseConfig: { useExistingUserSession: true },
    });

    await expect(
      frame.getByText(
        "Using the existing user's session in production is not allowed.",
        { exact: true },
      ),
    ).toBeAttached({ timeout: 40_000 });
    await expect(
      frame.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);
  });

  test("does not show an error if we are using an API key in development", async ({
    page,
    mb,
  }) => {
    const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { apiKey },
    });

    await assertDashboardLoaded(page, frame, dashCardQuery);
    await expect(
      frame.getByText("Using an API key in production is not allowed.", {
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("uses JWT when authMethod is set to 'jwt' and both SAML and JWT are enabled", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["jwt", "saml"],
      signOut: true,
    });

    const authSso = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/auth/sso" &&
        url.searchParams.get("preferred_method") === "jwt"
      );
    });

    const dashCardQuery = waitForDashCardQuery(page);
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { preferredAuthMethod: "jwt" },
    });

    expect((await (await authSso).json()).method).toBe("jwt");
    await assertDashboardLoaded(page, frame, dashCardQuery);
  });

  test("uses SAML when authMethod is set to 'saml' and both SAML and JWT are enabled", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, {
      enabledAuthMethods: ["jwt", "saml"],
      signOut: true,
    });

    // Once SAML is chosen the SDK opens the IdP AuthnRequest URL in a popup.
    // The IdP isn't real and we don't simulate the callback, so window.open is
    // stubbed inert — we only care that SAML (not JWT) was selected.
    await stubWindowOpenInert(page);

    const authSso = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/auth/sso" &&
        url.searchParams.get("preferred_method") === "saml"
      );
    });

    await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { preferredAuthMethod: "saml" },
    });

    // preferredAuthMethod: "saml" must route to the SAML initiate endpoint. It
    // returns 200 with the AuthnRequest redirect (the RelayState is stored
    // server-side; only a short key goes to the IdP).
    const response = await authSso;
    expect(response.status()).toBe(200);
    expect((await response.json()).method).toBe("saml");
  });
});

// === local helpers =======================================================

function embedFrame(page: Page): FrameLocator {
  return page.locator("iframe[data-metabase-embed]").first().contentFrame();
}

/** GET/POST {baseUrl}/auth/sso — upstream intercepts these by absolute URL. */
function waitForSso(page: Page, baseUrl: string, method: "GET" | "POST") {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).origin === new URL(baseUrl).origin &&
      new URL(response.url()).pathname === "/auth/sso",
  );
}

/** Port of the `@getDashCardQuery` alias: POST /api/dashboard/**\/query. */
function waitForDashCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/api/dashboard/") &&
      new URL(response.url()).pathname.endsWith("/query"),
    { timeout: 60_000 },
  );
}

async function assertDashboardLoaded(
  page: Page,
  frame: FrameLocator,
  dashCardQuery: Promise<unknown>,
) {
  await dashCardQuery;
  await waitForSimpleEmbedIframesToLoad(page);
  await expect(
    frame.getByText("Orders in a dashboard", { exact: true }),
  ).toBeVisible({ timeout: 40_000 });
  await expect(frame.getByText("Orders", { exact: true })).toBeVisible();
  // Port of H.assertTableRowsCount(2000).
  await expect(
    frame.getByTestId("table-body").getByRole("row").first(),
  ).toBeVisible();
  await expect(frame.getByTestId("table-root")).toHaveAttribute(
    "data-rows-count",
    "2000",
  );
}
