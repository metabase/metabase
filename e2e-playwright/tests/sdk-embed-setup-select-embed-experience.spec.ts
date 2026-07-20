import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import { archiveDashboard } from "../support/collections-trash";
import { openEmbedJsModal } from "../support/embedding";
import { createDashboard } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  assertDashboard,
  assertRecentItemName,
  embedModalEnableEmbedding,
  getEmbedSidebar,
  loadedPreviewIframe,
  visitNewEmbedPage,
} from "../support/sdk-embed-setup";
import {
  patchExampleDashboardId,
  throttleRecents,
  waitForRecentSelections,
} from "../support/sdk-embed-setup-select-embed-experience";
import { embedPreview } from "../support/sdk-embed-setup-select-embed-options";
import { waitForSimpleEmbedIframesToLoad } from "../support/sdk-iframe";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { visitQuestion } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-experience.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only; the only new code is `support/sdk-embed-setup-select-embed-experience.ts`
 * (three intercept ports), and `embedPreview` is imported from the landed
 * `select-embed-options` module rather than duplicated.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is not in this spec's beforeEach at all, so
 *   nothing to drop.
 * - SNOWPLOW IS THE SUBJECT: five tests assert `embed_wizard_*` events and
 *   `afterEach` asserts no bad events, so rule 6's no-op stub would delete the
 *   coverage. Uses `installSnowplowCapture` like the landed siblings.
 *   `H.enableTracking()` is still issued so backend state matches upstream.
 * - `cy.intercept(...).as("dashboard")` is subsumed by `visitNewEmbedPage`'s
 *   own armed wait (see support/sdk-embed-setup.ts). `@cardQuery` is subsumed
 *   by `visitQuestion`, which already waits for `POST /api/card/:id/query`.
 *   `@recentActivity` is armed explicitly via `waitForRecentSelections` before
 *   each navigation whose body a test asserts on (rule 2), because
 *   `assertRecentItemName` upstream reads the alias body.
 * - `H.getSimpleEmbedIframeContent()` is NOT a bare accessor — it retryingly
 *   asserts `iframe[data-metabase-embed]` and `iframe[data-iframe-loaded]`
 *   exist before scoping in. `embedPreview(page)` reproduces that gate, so the
 *   absence assertions below cannot pass against a blank preview.
 * - `should("not.exist")` retries upstream and passes at the first absent
 *   observation; `toHaveCount(0)` does the same and is the faithful port.
 * - Two tests carry `{ tags: "@skip" }` upstream and are ported as `test.skip`.
 */

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

test.describe("scenarios > embedding > sdk iframe embed setup > select embed experience", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);

    await mb.api.updateSetting("enable-embedding-simple", true);
    await mb.api.updateSetting("enable-embedding-static", true);
    // Required for the `metabot` experience card to render at all
    // (useMetabotEnabledEmbeddingAware) — see findings for get-code.
    await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  // Port of upstream's `afterEach(H.expectNoBadSnowplowEvents)`. Downgraded to
  // a structural check (see support/search-snowplow.ts) — micro's Iglu schema
  // validation has no container-free equivalent.
  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test.describe("select embed experiences with a non-empty activity log", () => {
    test("shows the most recent dashboard from the activity log by default", async ({
      page,
    }) => {
      const dashboardName = DASHBOARD_NAME;

      const recents = waitForRecentSelections(page);
      await visitNewEmbedPage(page);
      assertRecentItemName(
        await (await recents).json(),
        "dashboard",
        dashboardName,
      );

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_opened",
      });
      await waitForSimpleEmbedIframesToLoad(page);

      const sidebar = getEmbedSidebar(page);
      await sidebar.getByLabel("Guest", { exact: true }).click();
      await embedModalEnableEmbedding(page);

      await sidebar.getByText("Next", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=dashboard,isDefaultExperience=true",
      });

      const preview = await embedPreview(page);

      // dashboard title is visible
      await expect(
        preview.getByText(dashboardName, { exact: true }),
      ).toBeVisible();

      // dashboard card is visible
      await expect(preview.getByText("Orders", { exact: true })).toBeVisible();
    });

    test("shows the most recent question from the activity log when selected", async ({
      page,
    }) => {
      const questionName = QUESTION_NAME;

      // go to a question to add to the activity log. `visitQuestion` already
      // awaits `POST /api/card/:id/query` (upstream's `@cardQuery`).
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

      const recents = waitForRecentSelections(page);
      await visitNewEmbedPage(page);
      assertRecentItemName(await (await recents).json(), "card", questionName);

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_opened",
      });

      const sidebar = getEmbedSidebar(page);
      await sidebar.getByLabel("Guest", { exact: true }).click();
      await embedModalEnableEmbedding(page);

      await sidebar.getByText("Chart", { exact: true }).click();
      await sidebar.getByText("Next", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=guest-embed,experience=chart,isDefaultExperience=false",
      });

      const preview = await embedPreview(page);

      // question title is visible
      await expect(
        preview.getByText(questionName, { exact: true }),
      ).toBeVisible();
    });

    test("shows exploration template when selected", async () => {
      // Upstream carries `{ tags: "@skip" }` — kept skipped, faithfully.
      test.skip(true, "Upstream @skip tag");
    });

    test("shows browser template when selected", async ({ page }) => {
      await visitNewEmbedPage(page);

      const sidebar = getEmbedSidebar(page);
      await sidebar
        .getByLabel("Metabase account (SSO)", { exact: true })
        .click();

      await embedModalEnableEmbedding(page);

      await sidebar.getByText("Browser", { exact: true }).click();
      await sidebar.getByText("Next", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_experience_completed",
        event_detail:
          "authType=sso,experience=browser,isDefaultExperience=false",
      });

      const preview = await embedPreview(page);

      // collection is visible in breadcrumbs
      await expect(
        preview
          .getByTestId("sdk-breadcrumbs")
          .getByText("Our analytics", { exact: true })
          .first(),
      ).toBeVisible();

      // collection is visible in browser. Upstream is
      // `findAllByText(...).should("be.visible")`, an ANY-of-set assertion
      // (PORTING.md rule 3) → filter to the visible matches first.
      await expect(
        preview
          .getByText(DASHBOARD_NAME, { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("select embed experiences with an empty activity log", () => {
    test.beforeEach(async ({ page }) => {
      // simulate an empty activity log
      await page.route(
        (url) => url.pathname === "/api/activity/recents" && url.search !== "",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ recents: [] }),
          }),
      );

      // The embed wizard calls the search API to find recently created
      // dashboards. Without this, the snapshot's admin-owned dashboards
      // would be returned and selected as the default.
      await page.route(
        (url) => url.pathname === "/api/search" && url.search !== "",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: [], total: 0 }),
          }),
      );
    });

    test("shows dashboard of id=1 when activity log is empty", async ({
      page,
    }) => {
      // Armed before the navigation that triggers them (rule 2). Upstream's
      // `cy.wait("@emptyRecentItems")` is retroactive; the equivalent here is
      // an armed wait on the stubbed recents response.
      const emptyRecentItems = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/activity/recents",
      );
      const dashboardResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /^\/api\/dashboard\/\d+/.test(new URL(response.url()).pathname),
      );

      await visitNewEmbedPage(page);
      assertDashboard(await (await dashboardResponse).json(), {
        id: 1,
        name: "Person overview",
      });
      await emptyRecentItems;

      // dashboard title and card of id=1 should be visible
      await waitForSimpleEmbedIframesToLoad(page);

      const preview = await embedPreview(page);
      await expect(
        preview.getByText("Person overview", { exact: true }),
      ).toBeVisible();
      await expect(
        preview.getByText("Person detail", { exact: true }),
      ).toBeVisible();
    });

    test("shows question of id=1 when activity log is empty and chart is selected", async () => {
      // Upstream carries `{ tags: "@skip" }` — kept skipped, faithfully.
      test.skip(true, "Upstream @skip tag");
    });
  });

  test("should show a fake loading indicator in embed preview", async ({
    page,
  }) => {
    // The indicator is a TRANSIENT state, and upstream never synchronises on
    // it: `EmbedPreviewLoadingOverlay` renders from the moment the preview
    // mounts (modal open) until the embed element fires `ready`, which the
    // runtime emits on the iframe's `metabase.embed.iframeReady` postMessage —
    // the same instant it stamps `data-iframe-loaded`. So the window is
    // "modal open → iframe app booted", and the two steps between the open and
    // the assertion (`embedModalEnableEmbedding`'s visibility check + card
    // probe) race it. On CI that race was lost: the run-29715675294 error
    // context shows the wizard fully rendered with the preview iframe present
    // and no overlay, i.e. the indicator had already mounted AND cleared before
    // the first poll. See FINDINGS #54 — a fixed `setTimeout` hold is not
    // enough here, because the elapsed pre-assertion time on a contended
    // runner is unbounded. Instead the iframe document request is held open
    // until the test releases it, which makes the window deterministic.
    let releaseEmbedIframe!: () => void;
    let heldEmbedIframeRequests = 0;
    const embedIframeHeld = new Promise<void>((resolve) => {
      releaseEmbedIframe = resolve;
    });
    await page.route("**/embed/sdk/v1?**", async (route) => {
      heldEmbedIframeRequests += 1;
      await embedIframeHeld;
      await route.continue();
    });

    await page.goto(`/question/${ORDERS_QUESTION_ID}`);

    await openEmbedJsModal(page);
    await embedModalEnableEmbedding(page);
    // Strictly stronger than upstream: with the iframe document held, `ready`
    // CANNOT have fired, so this asserts the overlay is shown *because* the
    // preview has not loaded, rather than catching a flicker.
    await expect(
      page
        .locator("#iframe-embed-container")
        .getByTestId("preview-loading-indicator"),
    ).toBeVisible({ timeout: 20_000 });

    // Guards the scaffolding: if the embed runtime's iframe URL ever moves
    // (`EMBEDDING_ROUTE` in embedding-iframe-sdk/embed.ts), the route above
    // would silently match nothing and this test would quietly revert to the
    // race it is meant to remove. Fail loudly instead.
    expect(heldEmbedIframeRequests).toBeGreaterThan(0);

    releaseEmbedIframe();

    await expect(loadedPreviewIframe(page)).toHaveCount(1, { timeout: 20_000 });

    // ANCHOR for the absence below: the `toHaveCount(1)` above proves the
    // preview finished loading, which is exactly the transition that removes
    // the indicator. `toHaveCount(0)` retries, matching upstream's
    // `should("not.exist")`. Because the load only happened after the release,
    // this now also proves the clear is *caused* by the load.
    await expect(page.getByTestId("preview-loading-indicator")).toHaveCount(0);
  });

  test("should respect slow loading of recent dashboars and wait till loading complete", async ({
    page,
  }) => {
    await throttleRecents(page);

    await visitNewEmbedPage(page);

    const preview = await embedPreview(page);

    // Upstream's order is preserved: the absence of the *fallback* dashboard
    // is asserted before the expected one is asserted visible. Note the
    // asymmetry this inherits from the original — a retrying absence check
    // passes at its first absent observation, so it cannot by itself prove
    // "Person overview never flashed"; `embedPreview` at least guarantees the
    // preview iframe has finished loading before either check runs.
    await expect(
      preview.getByText("Person overview", { exact: true }),
    ).toHaveCount(0);
    await expect(
      preview.getByText(DASHBOARD_NAME, { exact: true }),
    ).toBeVisible();
  });

  test("shows no-data block when example-dashboard-id points to an archived dashboard", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboard(mb.api, {
      name: "Archived Dashboard",
    });
    await archiveDashboard(mb.api, dashboard.id);

    await patchExampleDashboardId(page, {
      dashboardId: dashboard.id,
      snowplowOrigin: mb.baseUrl,
    });

    // Upstream stubs this with `{ body: [] }` — a bare array, not
    // `{ recents: [] }`. Ported literally.
    await page.route(
      (url) => url.pathname === "/api/activity/recents",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        }),
    );

    const emptyRecentItems = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/activity/recents",
    );

    await visitNewEmbedPage(page, { waitForResource: false });

    await getEmbedSidebar(page)
      .getByLabel("Metabase account (SSO)", { exact: true })
      .click();

    await emptyRecentItems;

    await expect(
      page.getByAltText("No results", { exact: true }),
    ).toBeVisible();
  });

  test("shows Metabot experience when selected", async ({ page }) => {
    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await sidebar.getByLabel("Metabase account (SSO)", { exact: true }).click();

    await embedModalEnableEmbedding(page);

    await sidebar.getByText("Metabot", { exact: true }).click();
    await sidebar.getByText("Next", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_experience_completed",
      event_detail: "authType=sso,experience=metabot,isDefaultExperience=false",
    });

    const preview = await embedPreview(page);
    await expect(
      preview.getByText("Ask questions to AI.", { exact: true }),
    ).toBeVisible();
  });
});
