import type { FrameLocator, Locator, Page } from "@playwright/test";

import { isOssBackend } from "../support/admin";
import { configureSmtpSettings } from "../support/admin-extras";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import {
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { popover } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/embed-options.cy.spec.ts
 *
 * (Group A — the embed.js harness. NOT the similarly-named spec under
 * `sdk-iframe-embedding-setup/`.)
 *
 * Port notes:
 *
 * - `cy.wait("@getCardQuery")` / `@getDashCardQuery` are aliases registered by
 *   `H.prepareSdkIframeEmbedTest` (`POST /api/card/:id/query` and
 *   `POST /api/dashboard/…/query`). The Playwright harness deliberately
 *   does NOT register them (PORTING rule 2), so each test arms its own
 *   `waitForResponse` BEFORE `loadSdkIframeEmbedTestPage` triggers the load.
 *
 * - `H.setupSMTP()` PUTs `/api/email`, which live-validates the connection
 *   against the maildev container. This spec never sends or reads mail — it
 *   only needs Metabase to consider email *configured* so the subscription UI
 *   is reachable — so the existing container-free `configureSmtpSettings`
 *   (`support/admin-extras.ts`, same settings via `PUT /api/setting`, which
 *   skips connection validation) stands in. Keeps all three describes
 *   executable instead of gate-skipped on maildev.
 *
 * - `H.loadSdkIframeEmbedTestPage` blocks until the embed iframe exists and its
 *   body is non-empty; the Playwright port returns a lazy `FrameLocator`
 *   immediately. Every test therefore calls `waitForSimpleEmbedIframesToLoad`
 *   to restore that gate. This matters specifically for the many
 *   `should("not.exist")` checks: it retries but passes on its FIRST absent
 *   poll, so it is only meaningful once the thing that *would* contain the
 *   element has rendered. `expect(loc).toHaveCount(0)` has the identical
 *   semantics and is the faithful port; the render gate, not the assertion
 *   form, is what makes these non-vacuous. (See PORTING.md — an earlier
 *   revision used a non-retrying `count()`, which is stricter than upstream
 *   and can go falsely red on an in-place re-render.)
 *
 * - The `@OSS` describe is gated on `isOssBackend` (PORTING wave-5 rule); the
 *   spike's backend is EE, so it gate-skips here.
 */

const SUBSCRIPTIONS_BUTTON = "Subscriptions";

test.describe("OSS > scenarios > embedding > Modular embedding (ex EAJS)", () => {
  test.describe("dashboards", () => {
    test("should not render a subscription button even with `with-subscriptions=true`", async ({
      page,
      mb,
    }) => {
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS-tagged: OSS-only behaviour, this backend is EE",
      );

      const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
        withToken: false,
        enabledAuthMethods: ["api-key"],
      });
      await configureSmtpSettings(mb.api);
      await mb.signOut();

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              withSubscriptions: true,
            },
          },
        ],
        metabaseConfig: { apiKey },
      });

      await assertNoSubscriptionsButton(page, frame);
    });
  });
});

test.describe("EE without license > scenarios > embedding > Modular embedding (EAJS)", () => {
  test("should not render a subscription button even with `with-subscriptions=true`", async ({
    page,
    mb,
  }) => {
    const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "starter",
      enabledAuthMethods: ["api-key"],
    });
    await configureSmtpSettings(mb.api);
    await mb.signOut();

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            withSubscriptions: true,
          },
        },
      ],
      metabaseConfig: { apiKey },
    });

    await assertNoSubscriptionsButton(page, frame);
  });
});

test.describe("EE > scenarios > embedding > Modular embedding (EAJS)", () => {
  test("should render a subscription button with `with-subscriptions=true`", async ({
    page,
    mb,
  }) => {
    await prepareSdkIframeEmbedTest(page, mb, { withToken: "bleeding-edge" });
    await configureSmtpSettings(mb.api);
    await mb.signOut();

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            withSubscriptions: true,
          },
        },
      ],
    });

    await waitForSimpleEmbedIframesToLoad(page);

    const subscriptions = frame.getByRole("button", {
      name: SUBSCRIPTIONS_BUTTON,
      exact: true,
    });
    await expect(subscriptions).toBeVisible({ timeout: 40_000 });
    await subscriptions.click();

    const sidebar = dashboardSidebar(frame);

    // set up the first subscription
    await sidebar.getByRole("button", { name: "Done", exact: true }).click();

    // set up the second subscription
    await sidebar
      .getByRole("button", { name: "Set up a new schedule", exact: true })
      .click();
    (await findByDisplayValue(sidebar, "Hourly")).click();

    await popover(frame)
      .getByRole("option", { name: "Daily", exact: true })
      .click();
    await frame.getByRole("button", { name: "Done", exact: true }).click();

    // Header
    await expect(
      sidebar.getByText(SUBSCRIPTIONS_BUTTON, { exact: true }),
    ).toBeVisible();

    // Subscription list
    await expect(
      sidebar.getByText("Bobby Tables", { exact: true }),
    ).toHaveCount(2);
    await expect(
      sidebar.getByText("Emailed hourly", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("Emailed daily at 8:00 AM", { exact: true }),
    ).toBeVisible();
  });
});

function dashboardSidebar(frame: FrameLocator): Locator {
  return frame.getByRole("complementary");
}

test.describe("scenarios > embedding > sdk iframe embed options passthrough", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, { signOut: true });
  });

  test("shows a static question with drills=false", async ({ page, mb }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: false,
          },
        },
      ],
    });

    await cardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    // 1. static question must not contain title and toolbar
    await expect(
      frame.getByTestId("interactive-question-result-toolbar"),
    ).toHaveCount(0);

    // 2. clicking on the column value should not show the popover
    const cell = frame.getByText("37.65", { exact: true }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(frame.getByText(/Filter by this value/)).toHaveCount(0);
  });

  test("shows a static question with drills=false, withTitle=true", async ({
    page,
    mb,
  }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: false,
            withTitle: true,
          },
        },
      ],
    });

    await cardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    // static question must contain title, but not toolbar
    await expect(frame.getByText("Orders", { exact: true })).toBeVisible();
    await expect(
      frame.getByTestId("interactive-question-result-toolbar"),
    ).toHaveCount(0);
  });

  test("shows a static dashboard using drills=false, withTitle=false, withDownloads=true", async ({
    page,
    mb,
  }) => {
    const dashCardQuery = waitForDashCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            drills: false,
            withTitle: false,
            withDownloads: true,
          },
        },
      ],
    });

    await dashCardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    // 1. card title should be visible
    await expect(frame.getByText("Orders", { exact: true })).toBeVisible();

    // 2. dashboard title should not exist -- withTitle=false
    await expect(
      frame.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);

    // 3. download button should be visible -- withDownloads=true
    await expect(frame.locator('[aria-label="Download as PDF"]')).toBeVisible();

    // 4. clicking on the column value should not show the popover
    const cell = frame.getByText("37.65", { exact: true }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(frame.getByText(/Filter by this value/)).toHaveCount(0);
  });

  test("renders an interactive question with drills=true, withTitle=false, withDownloads=true", async ({
    page,
    mb,
  }) => {
    const cardQuery = waitForCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
            drills: true,
            withDownloads: true,
            withTitle: false,
          },
        },
      ],
    });

    await cardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    // 2. download button on the toolbar should be visible
    // (asserted first so the absence check below is not taken against an
    // un-rendered question — same instant, stronger anchor.)
    await expect(frame.locator("[aria-label='download icon']")).toBeVisible();

    // 1. card title should not exist
    await expect(frame.getByText("Orders", { exact: true })).toHaveCount(0);

    // 3. clicking on the column value should show the popover
    const cell = frame.getByText("37.65", { exact: true }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(frame.getByText(/Filter by this value/)).toBeVisible();

    // 4. clicking on the filter should drill down
    await frame
      .getByTestId("click-actions-filter-section")
      .locator("button")
      .first()
      .click();
    await expect(
      frame.getByText("29.8", { exact: true }).first(),
    ).toBeVisible();

    // 5. should not show a save button
    await expect(frame.getByText("Save", { exact: true })).toHaveCount(0);
  });

  test("renders an interactive dashboard with drills=true, withDownloads=true, withTitle=false", async ({
    page,
    mb,
  }) => {
    const dashCardQuery = waitForDashCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            drills: true,
            withDownloads: true,
            withTitle: false,
          },
        },
      ],
    });

    await dashCardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    // 2. card title should be visible
    await expect(frame.getByText("Orders", { exact: true })).toBeVisible();

    // 1. dashboard title should not exist -- withTitle=false
    await expect(
      frame.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);

    // 3. download button should be visible -- withDownloads=true
    await expect(frame.locator('[aria-label="Download as PDF"]')).toBeVisible();

    // 4. clicking on the column value should show the popover
    const cell = frame.getByText("37.65", { exact: true }).first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(frame.getByText(/Filter by this value/)).toBeVisible();

    // 5. clicking on the filter should drill down
    await frame
      .getByTestId("click-actions-filter-section")
      .locator("button")
      .first()
      .click();
    await expect(
      frame.getByText("29.8", { exact: true }).first(),
    ).toBeVisible();

    // 6. saving should be disabled in drill-throughs
    await expect(frame.getByText("Save", { exact: true })).toHaveCount(0);
  });

  test("renders the exploration template with isSaveEnabled=true, targetCollection, entityTypes", async ({
    page,
    mb,
  }) => {
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: "new",
            isSaveEnabled: true,
            targetCollection: FIRST_COLLECTION_ID,
            entityTypes: ["table"],
          },
        },
      ],
    });

    await waitForSimpleEmbedIframesToLoad(page);

    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });

    await popover(frame).getByText("Orders", { exact: true }).click();

    await frame.getByRole("button", { name: "Visualize", exact: true }).click();

    // 1. clicking on the filter should drill down
    const cell = frame.getByText("37.65", { exact: true }).first();
    await expect(cell).toBeVisible({ timeout: 40_000 });
    await cell.click();
    await expect(frame.getByText(/Filter by this value/)).toBeVisible();
    await frame
      .getByTestId("click-actions-filter-section")
      .locator("button")
      .first()
      .click();
    await expect(
      frame.getByText("29.8", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      frame.getByTestId("interactive-question-result-toolbar"),
    ).toBeVisible();

    // 2. saving should be enabled
    await frame.getByText("Save", { exact: true }).click();

    // 3. we should not see the collection picker as we have a target collection
    await expect(
      frame.getByText("Where do you want to save this?", { exact: true }),
    ).toHaveCount(0);
  });
});

// === local helpers =======================================================

/** Port of the `@getCardQuery` alias: POST /api/card/:id/query. */
function waitForCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/[^/]+\/query$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

/** Port of the `@getDashCardQuery` alias: POST /api/dashboard/…/query. */
function waitForDashCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/api/dashboard/") &&
      new URL(response.url()).pathname.endsWith("/query"),
    { timeout: 60_000 },
  );
}

/**
 * Shared body of the OSS / EE-without-license tests: the dashboard renders,
 * and no Subscriptions button is present even though
 * `with-subscriptions=true` was passed.
 *
 * The dashboard-title visibility assertion is the anchor Cypress got for free
 * (`getSimpleEmbedIframeContent` blocks on a loaded, non-empty iframe body).
 * Without it the absence check would pass trivially against a blank frame.
 */
async function assertNoSubscriptionsButton(page: Page, frame: FrameLocator) {
  await waitForSimpleEmbedIframesToLoad(page);
  await expect(
    frame.getByText("Orders in a dashboard", { exact: true }),
  ).toBeVisible({ timeout: 40_000 });

  await expect(
    frame.getByRole("button", { name: SUBSCRIPTIONS_BUTTON, exact: true }),
  ).toHaveCount(0);
}
