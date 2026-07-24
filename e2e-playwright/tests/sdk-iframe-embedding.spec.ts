import { createDashboardWithQuestions } from "../support/factories";
import { expect, test } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { embedModalEnableEmbedding } from "../support/sdk-embed-setup";
import {
  assertEmbedTargetsThisSlot,
  getSimpleEmbedIframe,
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  readApplicationNameFromEmbed,
  waitForSimpleEmbedIframesToLoad,
  writeSlotMarker,
} from "../support/sdk-iframe";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ENTITY_ID,
  assertOrdersDashboardVisible,
  assertSdkInteractiveQuestionOrdersUsable,
  assertSdkNotebookEditorUsable,
  countDashCardQueries,
  getEmbedFrame,
  tableInteractive,
  useHttpsMockJwtProvider,
  waitForCardQuery,
  waitForDashCardQuery,
} from "../support/sdk-iframe-embedding";
import { openSharingMenu } from "../support/sharing";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-iframe-embedding.cy.spec.ts
 *
 * Group A of the SDK-iframe tier: needs the `embed.js` customer-page harness in
 * `support/sdk-iframe.ts`, which is consumed here read-only. See
 * findings-inbox/sdk-iframe-harness.md for the URL-derivation rule (every
 * `http://localhost:4000` becomes `mb.baseUrl`) and for the two environmental
 * blockers (credentialed CORS on the mock JWT provider; Private Network Access
 * on the non-loopback "production origin" pages) that the harness already
 * solves.
 *
 * Port notes, in the order they appear:
 *
 * - `cy.intercept(...).as("getDashCardQuery"/"getCardQuery")` lives in
 *   `H.prepareSdkIframeEmbedTest` upstream. The harness deliberately does NOT
 *   register those aliases (PORTING rule 2), so each test arms its own
 *   `waitForResponse` before the triggering navigation. Where the spec reads
 *   `cy.get("@alias.all")` — i.e. uses the alias as a *counter*, not a wait —
 *   it is ported as a passive `page.on("request")` counter.
 *
 * - `frame.window()` in Cypress yields the **AUT (top-level) window**, not the
 *   iframe's, regardless of the chained subject. Every `frame.window().then(win
 *   => win.document.querySelector("metabase-question"))` in this spec is
 *   therefore operating on the *customer page*, where the custom elements live.
 *   Ported as ordinary `page.locator("metabase-question").evaluate(...)`.
 *   The one place upstream really does reach into the embed document
 *   (`cy.get("iframe").its("0.contentWindow")` in the handleLink test) is
 *   ported through `getEmbedFrame`.
 *
 * - `onVisitPage(win)` (the `ready`-event test) ran on the page's load event.
 *   Ported as an `insertHtml.afterEmbed` script, which runs immediately after
 *   the custom elements are parsed — the same window, without an addInitScript
 *   ordering race. Upstream's in-callback `expect(attrValue).to.not.equal(...)`
 *   is recorded on `window` and asserted in the test body, per PORTING's
 *   "callback-scoped assertions don't enforce" rule: a callback that never runs
 *   must fail loudly.
 *
 * - The `analytics` describe drops `cy.visit("http://localhost:4000")`. It
 *   exists to reset Cypress's AUT origin between `cy.visit`s and has no
 *   Playwright analogue (same call, same reasoning, as the authentication port).
 *   Snowplow is the *subject* of that describe, so PORTING rule 6's no-op stub
 *   does not apply: `installSnowplowCapture` captures the real tracker payloads
 *   at the browser boundary.
 *
 * - `H.expectUnstructuredSnowplowEvent(x, 0)` with `components: []` is ported as
 *   a predicate over `event` + `global` only. Upstream's `isDeepMatch` iterates
 *   the *expected* array's indices, so `[]` matches any array — i.e. it means
 *   "ignore components". Our shared `isDeepMatch` compares array lengths
 *   (deliberately, see search-snowplow), which for a **count-0** assertion would
 *   be a *weakening*, so the predicate form restores upstream's meaning.
 *
 * - `cy.clock()`: see the `auto-refreshing dashboard` describe. Upstream gives
 *   up on it and uses real timeouts; `page.clock` does reach into the embed
 *   iframe. Details and evidence in findings-inbox/sdk-iframe-embedding.md.
 */

const { ORDERS_ID: ORDERS_TABLE_ID, ORDERS } = SAMPLE_DATABASE;

test.describe("scenarios > embedding > modular embedding", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, { signOut: true });
  });

  test("can find the embed.js file", async ({ mb }) => {
    // Upstream hardcodes http://localhost:4000/app/embed.js; on the per-worker
    // slot model that must be this slot's own backend.
    const response = await mb.api.get("/app/embed.js");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(typeof body).toBe("string");
    expect(body.length).toBeGreaterThan(0);
  });

  test("uses the embedding-simple client request header", async ({
    page,
    mb,
  }) => {
    const dashCardRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.startsWith("/api/dashboard/") &&
        new URL(request.url()).pathname.endsWith("/query"),
      { timeout: 60_000 },
    );

    await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    const request = await dashCardRequest;
    expect((await request.allHeaders())["x-metabase-client"]).toBe(
      "embedding-simple",
    );
  });

  test("displays a dashboard", async ({ page, mb }) => {
    // STRENGTHENED vs upstream (the anti-FINDINGS-#39 guard). Every content
    // assertion in this tier passes just as well against the shared :4000 dev
    // instance, which carries identical sample data — so this test additionally
    // proves the embed is on THIS slot's backend. The marker is written and the
    // admin session dropped again before the test's own flow starts, leaving
    // the signed-out state the beforeEach set up.
    await mb.signInAsAdmin();
    const marker = await writeSlotMarker(mb);
    await mb.signOut();

    const dashCardQuery = waitForDashCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
    });

    await dashCardQuery;
    await assertOrdersDashboardVisible(frame);

    // Leg 1 (structural): the iframe's src origin and the iframe document's own
    // location are this slot. Leg 2 (behavioural): a value only this slot's app
    // DB holds is readable from inside the embed document's own runtime.
    await assertEmbedTargetsThisSlot(page, mb);
    expect(
      await readApplicationNameFromEmbed(page),
      "the embed must be served by THIS slot's backend, not :4000",
    ).toBe(marker);
  });

  test("displays a question", async ({ page, mb }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ID },
        },
      ],
    });

    await cardQuery;
    await assertSdkInteractiveQuestionOrdersUsable(frame);
  });

  test("table visualization should span the full width of the container (metabase#69831)", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    const question = await mb.api.createQuestion({
      name: "Narrow table question",
      query: {
        "source-table": ORDERS_TABLE_ID,
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
        ],
        limit: 5,
      },
    });
    await mb.signOut();

    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: question.id },
        },
      ],
    });

    await cardQuery;

    // clientWidth excludes the scrollbar gutter, giving us the actual content
    // area. Upstream uses `.should()` (not `.then()`) so Cypress retries until
    // the async column-expansion cycle has finished painting — `expect.poll` is
    // the direct equivalent.
    const scrollContainer = tableInteractive(frame).getByTestId(
      "table-scroll-container",
    );
    await expect(scrollContainer).toBeVisible({ timeout: 40_000 });

    await expect
      .poll(
        () =>
          scrollContainer.evaluate((element) => {
            const contentWidth = element.clientWidth;
            const headerCells = element.querySelectorAll(
              '[data-testid="header-cell"]',
            );
            let totalHeaderWidth = 0;
            headerCells.forEach((cell) => {
              totalHeaderWidth += cell.getBoundingClientRect().width;
            });
            return {
              contentWidthIsPositive: contentWidth > 0,
              hasHeaderCells: headerCells.length > 0,
              headerSpansContent:
                Math.round(totalHeaderWidth) >= Math.round(contentWidth),
              contentWidth,
              headerCellCount: headerCells.length,
              totalHeaderWidth: Math.round(totalHeaderWidth),
            };
          }),
        { timeout: 20_000 },
      )
      .toMatchObject({
        contentWidthIsPositive: true,
        hasHeaderCells: true,
        headerSpansContent: true,
      });
  });

  test("displays a dashboard using entity id", async ({ page, mb }) => {
    const dashCardQuery = waitForDashCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ENTITY_ID },
        },
      ],
    });

    await dashCardQuery;
    await assertOrdersDashboardVisible(frame);
  });

  test("displays a question using entity id", async ({ page, mb }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ENTITY_ID },
        },
      ],
    });

    await cardQuery;
    await assertSdkInteractiveQuestionOrdersUsable(frame);
  });

  test("displays the exploration template", async ({ page, mb }) => {
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: "new" },
        },
      ],
    });

    await assertSdkNotebookEditorUsable(frame);

    // We hide the "Save" button for now. This will be customizable in the
    // future. (The preceding assertion leaves the page settled. Note upstream's
    // `should("not.exist")` also retries — it is not "one-shot" — so the
    // retrying form here is the faithful port, not a strengthening.)
    await expect(
      frame.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);
  });

  test("applies the provided locale", async ({ page, mb }) => {
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],
      metabaseConfig: { locale: "de" },
    });

    await expect(
      frame.getByText("Zeige die ersten 2,000 Zeilen", { exact: true }),
    ).toBeAttached({ timeout: 40_000 });
  });

  test("updates the question id with embed.setAttribute", async ({
    page,
    mb,
  }) => {
    const firstCardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ID },
        },
      ],
    });

    await firstCardQuery;
    await expect(
      frame.getByText("Orders, Count", { exact: true }),
    ).toHaveCount(0);

    // 1. call embed.setAttribute to update the question id
    const secondCardQuery = waitForCardQuery(page);
    await page
      .locator("metabase-question")
      .evaluate(
        (element, questionId) => element.setAttribute("question-id", questionId),
        String(ORDERS_COUNT_QUESTION_ID),
      );
    await secondCardQuery;

    // 2. the question should be updated
    await expect(
      page.locator("iframe[data-metabase-embed]").first(),
    ).toBeVisible();
    await expect(
      frame.getByText("Orders, Count", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });

    await expect(
      tableInteractive(frame).getByText("Count", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(frame).getByText("18,760", { exact: true }),
    ).toBeVisible();
  });

  test("fires ready event after iframe is loaded", async ({ page, mb }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ID },
        },
      ],
      insertHtml: {
        // Port of upstream's `onVisitPage(win)`. Runs right after the custom
        // elements are parsed, which is the same window `onLoad` saw.
        afterEmbed: `
          <script>
            const element = document.querySelector("metabase-question");
            element.addEventListener("ready", () => {
              document.body.setAttribute("data-consumer-event-triggered", "true");
            });

            // Upstream asserts inside the callback that the attribute is not
            // set at the start. Record it and assert in the test body instead,
            // so a callback that never runs fails loudly.
            window.__attributeAtStart = document.body.getAttribute(
              "data-consumer-event-triggered",
            );
          </script>
        `,
      },
    });

    await cardQuery;

    expect(await page.evaluate(() => (window as any).__attributeAtStart)).not.toBe(
      "true",
    );

    // ready event should be fired after the iframe is loaded
    await expect(
      page.locator("iframe[data-metabase-embed]").first(),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute(
      "data-consumer-event-triggered",
      "true",
    );

    // iframe content should now be loaded
    await assertSdkInteractiveQuestionOrdersUsable(frame);
  });

  test("shows dashboard title when updateSettings({ withTitle: true }) is called", async ({
    page,
    mb,
  }) => {
    const dashCardQuery = waitForDashCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID, withTitle: false },
        },
      ],
    });

    await dashCardQuery;

    // 1. dashboard title should initially be hidden
    await expect(frame.getByText("Orders", { exact: true })).toBeVisible({
      timeout: 40_000,
    });
    await expect(
      frame.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);

    // 2. call setAttribute to show the title
    await page
      .locator("metabase-dashboard")
      .evaluate((element) => element.setAttribute("with-title", "true"));

    // 3. dashboard title should now be visible
    await expect(
      frame.getByText("Orders in a dashboard", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });
  });

  test.describe("auto-refreshing dashboard", () => {
    /**
     * Upstream's comment here reads:
     *
     *   "Unfortunately, cy.clock() doesn't seem to work with mocking the timing
     *    inside the iframe, so we have to use real timeouts here."
     *
     * `page.clock` DOES install into the embed iframe. Playwright installs the
     * clock on the whole BrowserContext, so every page *and frame* shares one
     * fake clock — measured directly (see findings-inbox/sdk-iframe-embedding.md):
     * inside the embed frame `window.setTimeout` is Playwright's stub, and the
     * frame's `Date.now()` advances by exactly the amount passed to `runFor`.
     *
     * Both tests install the clock, let the page load naturally (it ticks at
     * real rate until paused), then PAUSE it and drive the dashboard's 1s
     * `setInterval` (`useDashboardRefreshPeriod` → `@mantine/hooks`
     * `useInterval`, inside the iframe) with `runFor`.
     *
     * ADVANCE IN 1-SECOND STEPS, NOT ONE BIG JUMP. Measured: 12 × `runFor(1000)`
     * produces exactly 12 refreshes (one per virtual second — the period under
     * test), while a single `runFor(3000)` produces **zero** and a single
     * `runFor(5000)` produces one. A jump larger than the interval fires the
     * repeating timer's ticks back-to-back in one task, and the dashboard's
     * refresh coalesces them. Stepping matches how real time reaches the app.
     *
     * The two tests are each other's control, which is what keeps this from
     * being a vacuous pass: with real time frozen, "does refresh" can only pass
     * if `runFor` reaches the timer *inside the iframe* — so when "does not
     * refresh" then sees nothing over 30 stepped virtual seconds, we know the
     * clock we advanced is the one the iframe is on.
     */

    /** Virtual seconds per step — the dashboard's own tick period. */
    const VIRTUAL_STEP_MS = 1_000;

    test('does not automatically refresh the dashboard when "auto-refresh-interval" is not set', async ({
      page,
      mb,
    }) => {
      await page.clock.install();

      const dashCardQueries = countDashCardQueries(page);

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        elements: [
          {
            component: "metabase-dashboard",
            attributes: { dashboardId: ORDERS_DASHBOARD_ID },
          },
        ],
      });

      await assertOrdersDashboardVisible(frame);

      // Freeze real time, so nothing but `runFor` can advance a timer.
      await page.clock.pauseAt(new Date(Date.now() + VIRTUAL_STEP_MS));

      const initialRequestCount = dashCardQueries.count;

      // Upstream waits 1000ms of REAL time. 30 stepped virtual seconds is a
      // 30× wider window at roughly the same wall-clock cost.
      for (let step = 0; step < 30; step++) {
        await page.clock.runFor(VIRTUAL_STEP_MS);
      }
      await page.waitForTimeout(1_000);

      expect(dashCardQueries.count).toBe(initialRequestCount);
    });

    test('automatically refresh the dashboard when "auto-refresh-interval" is set', async ({
      page,
      mb,
    }) => {
      await page.clock.install();

      const dashCardQueries = countDashCardQueries(page);

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              autoRefreshInterval: 1,
            },
          },
        ],
      });

      await assertOrdersDashboardVisible(frame);

      await page.clock.pauseAt(new Date(Date.now() + VIRTUAL_STEP_MS));

      const initialRequestCount = dashCardQueries.count;

      // Upstream relies on Cypress's implicit retry of
      // `should("have.length.above", initial)`. Same shape here, except each
      // retry advances the clock by one virtual second instead of waiting a
      // real one. With the clock paused this can ONLY pass if `runFor` reaches
      // the timer inside the iframe.
      await expect
        .poll(
          async () => {
            await page.clock.runFor(VIRTUAL_STEP_MS);
            return dashCardQueries.count;
          },
          { timeout: 20_000 },
        )
        .toBeGreaterThan(initialRequestCount);
    });
  });

  test("CSP nonces are set for custom expression styles (EMB-707)", async ({
    page,
    mb,
  }) => {
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: "new" },
        },
      ],
    });

    await expect(frame.getByText("Orders", { exact: true }).first()).toBeVisible(
      { timeout: 40_000 },
    );

    await frame
      .locator(".popover[data-state~='visible'],[data-element-id=mantine-popover]")
      .filter({ visible: true })
      .getByText("Orders", { exact: true })
      .click();

    // csp nonces should be set
    const nonceStyles = frame.locator("style[nonce]");
    await expect
      .poll(() => nonceStyles.count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const nonce = await nonceStyles.first().getAttribute("nonce");
    expect(nonce?.length ?? 0).toBeGreaterThan(4);

    await frame
      .getByRole("button", { name: "Custom column", exact: true })
      .click();

    // injected codemirror styles should be set
    const expressionEditor = frame.getByTestId(
      "custom-expression-query-editor",
    );
    await expect(expressionEditor).toBeVisible();
    await expect(
      expressionEditor.locator(".cm-editor .cm-placeholder"),
    ).toHaveCSS("color", "rgb(136, 136, 136)");

    await frame.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test.describe("handleLink", () => {
    let linkDashboardId: number;

    test.beforeEach(async ({ mb }) => {
      // Create a question with a URL column for testing handleLink
      await mb.signInAsAdmin();
      const { dashboard } = await createDashboardWithQuestions(mb.api, {
        dashboardName: "Dashboard with links",
        questions: [
          {
            name: "Question with link column",
            query: {
              "source-table": ORDERS_TABLE_ID,
              expressions: {
                "link url": [
                  "concat",
                  "https://example.org/order/",
                  ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                ],
              },
              fields: [
                ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                ["expression", "link url", { "base-type": "type/Text" }],
              ],
              limit: 5,
            },
            visualization_settings: {
              column_settings: {
                '["name","ID"]': {
                  view_as: "link",
                  link_text: "Order {{ID}}",
                  link_url: "https://example.org/order/{{ID}}",
                },
              },
            },
          },
        ],
        cards: [{ size_x: 24, size_y: 6, col: 0, row: 0 }],
      });
      linkDashboardId = dashboard.id;

      await mb.signOut();
    });

    test("calls handleLink when a link is clicked and prevents navigation when handled: true", async ({
      page,
      mb,
    }) => {
      const dashCardQuery = waitForDashCardQuery(page);

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        elements: [
          {
            component: "metabase-dashboard",
            attributes: { dashboardId: linkDashboardId },
          },
        ],
        insertHtml: {
          afterEmbed: `
            <script>
              window.handleLinkCalls = [];
              window.metabaseConfig.pluginsConfig = {
                handleLink: (url) => {
                  window.handleLinkCalls.push(url);
                  return { handled: true };
                },
              };
            </script>
          `,
        },
      });

      await dashCardQuery;
      await waitForSimpleEmbedIframesToLoad(page);

      // Spy on the iframe's anchor clicks and window.open so we can check the
      // default behavior is prevented.
      const embedFrame = await getEmbedFrame(page);
      await embedFrame.evaluate(() => {
        const win = window as any;
        win.__blankLinkClicks = [];
        win.__windowOpenCalls = [];

        win.HTMLAnchorElement.prototype.click = function (this: {
          href: string;
        }) {
          win.__blankLinkClicks.push(this.href);
        };

        win.open = function (...args: unknown[]) {
          win.__windowOpenCalls.push(args);
        };
      });

      await frame.getByText("Order 1", { exact: true }).click();

      // Verify handleLink was called with the correct URL
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).handleLinkCalls as string[]),
        )
        .toHaveLength(1);
      const [handledUrl] = await page.evaluate(
        () => (window as any).handleLinkCalls as string[],
      );
      expect(handledUrl).toContain("https://example.org/order/1");

      // Verify that no default navigation happened
      expect(
        await embedFrame.evaluate(
          () => (window as any).__blankLinkClicks as string[],
        ),
      ).toHaveLength(0);
      expect(
        await embedFrame.evaluate(
          () => (window as any).__windowOpenCalls as unknown[],
        ),
      ).toHaveLength(0);
    });
  });

  test.describe("analytics", () => {
    let snowplow: Awaited<ReturnType<typeof installSnowplowCapture>>;

    test.beforeEach(async ({ page, mb }) => {
      // Port of H.resetSnowplow + H.enableTracking. Snowplow events are the
      // SUBJECT here, so PORTING rule 6's no-op stub would make these tests
      // vacuous; capture the real payloads at the browser boundary instead.
      // Must be installed before the first navigation.
      const capture = await installSnowplowCapture(page, mb.baseUrl);
      snowplow = capture;
      capture.reset();

      await prepareSdkIframeEmbedTest(page, mb, {
        enabledAuthMethods: ["jwt"],
        signOut: false,
      });
      await mb.api.updateSetting("anon-tracking-enabled", true);

      // These three tests serve the customer page from a NON-localhost origin,
      // so the SDK's `fetch("${instanceUrl}/auth/sso", …)` is cross-origin and
      // the browser requires `Access-Control-Allow-Origin` on the response.
      // Cypress never sees this: `chromeWebSecurity: false` disables the check
      // outright. The product's own mechanism for it is the
      // `embedding-app-origins-sdk` setting, which is exactly what a real
      // cross-origin embed host has to configure
      // (server/middleware/security.clj `access-control-headers`), so this is
      // the faithful stand-in rather than a route-level patch. Same class as
      // the two blockers recorded in findings-inbox/sdk-iframe-harness.md §3.
      await mb.api.updateSetting("embedding-app-origins-sdk", "*");

      // …and for the same reason the mock JWT provider has to be reachable
      // from an https document: `http://auth-provider/sso` is blocked as mixed
      // content. See `useHttpsMockJwtProvider`.
      await useHttpsMockJwtProvider(page, mb);
    });

    test("should send an modular embedding usage event", async ({
      page,
      mb,
    }) => {
      await mb.signOut();

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        origin: "http://different-than-metabase-instance.com",
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              "with-subscriptions": true,
            },
          },
          {
            component: "metabase-question",
            attributes: { questionId: ORDERS_QUESTION_ID },
          },
          {
            component: "metabase-question",
            attributes: { questionId: "new" },
          },
          {
            component: "metabase-browser",
            attributes: {},
          },
        ],
      });
      // Upstream pins the dashboard's iframe with
      // `selector: '[dashboard-id="…"] > iframe'`; the harness's frame accessor
      // is index-based and the dashboard element is first, which is the same
      // element.

      await assertOrdersDashboardVisible(frame);

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "setup",
        global: {
          auth_method: "sso",
          locale_used: false,
        },
        components: [
          {
            name: "dashboard",
            properties: [
              {
                name: "drills",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "with_downloads",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "with_title",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "with_subscriptions",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "auto_refresh_interval",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "enable_entity_navigation",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
            ],
          },
          {
            name: "question",
            properties: [
              {
                name: "drills",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "with_downloads",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "with_title",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "is_save_enabled",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "with_alerts",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
            ],
          },
          {
            name: "exploration",
            properties: [
              {
                name: "is_save_enabled",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "id_new_native",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "id_new",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
            ],
          },
          {
            name: "browser",
            properties: [
              {
                name: "read_only",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "enable_entity_navigation",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
            ],
          },
        ],
      });
    });

    test("should send locale_used=true when locale is configured", async ({
      page,
      mb,
    }) => {
      await mb.signOut();

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        origin: "http://different-than-metabase-instance.com",
        elements: [
          {
            component: "metabase-dashboard",
            attributes: { dashboardId: ORDERS_DASHBOARD_ID },
          },
        ],
        metabaseConfig: { locale: "de" },
      });

      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "setup",
        global: {
          auth_method: "sso",
          locale_used: true,
        },
        components: [
          {
            name: "dashboard",
            properties: [
              {
                name: "drills",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "with_downloads",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "with_title",
                values: [
                  { group: "false", value: 0 },
                  { group: "true", value: 1 },
                ],
              },
              {
                name: "with_subscriptions",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "auto_refresh_interval",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
              {
                name: "enable_entity_navigation",
                values: [
                  { group: "false", value: 1 },
                  { group: "true", value: 0 },
                ],
              },
            ],
          },
        ],
      });
    });

    test("should not send SDK tracker events through the analytics proxy", async ({
      page,
      mb,
    }) => {
      let proxyCallCount = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/analytics-proxy"
        ) {
          proxyCallCount += 1;
        }
      });

      await mb.signOut();

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        origin: "http://different-than-metabase-instance.com",
        elements: [
          {
            component: "metabase-dashboard",
            attributes: { dashboardId: ORDERS_DASHBOARD_ID },
          },
        ],
      });

      await expect(
        frame.getByText("Orders in a dashboard", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      // MUTATION CHECK for this negative assertion: the counter is only
      // meaningful if the SDK really did emit its usage event somewhere. Assert
      // the event was captured by the collector — same run, same page — so a
      // silently-inert tracker cannot make `proxyCallCount === 0` pass.
      await expectUnstructuredSnowplowEvent(
        snowplow,
        (event) => event.event === "setup",
      );
      expect(proxyCallCount).toBe(0);
    });

    test("should not send an modular embedding usage event in the preview", async ({
      page,
      mb,
    }) => {
      await page.goto(`${mb.baseUrl}/question/${ORDERS_QUESTION_ID}`);

      await openSharingMenu(page, "Embed");
      await embedModalEnableEmbedding(page);

      await waitForSimpleEmbedIframesToLoad(page);
      await expect(
        getSimpleEmbedIframe(page).getByText("Orders", { exact: true }).first(),
      ).toBeVisible({ timeout: 40_000 });

      // Expect that the usage event shouldn't be sent. Upstream passes
      // `components: []`, which its `isDeepMatch` treats as "any array" — so
      // the assertion is over `event` + `global` only. Expressed as a predicate
      // because our shared `isDeepMatch` compares array lengths.
      await expectUnstructuredSnowplowEvent(
        snowplow,
        (event) =>
          event.event === "setup" &&
          (event.global as { auth_method?: string; locale_used?: boolean })
            ?.auth_method === "session" &&
          (event.global as { locale_used?: boolean })?.locale_used === false,
        0,
      );
    });
  });
});
