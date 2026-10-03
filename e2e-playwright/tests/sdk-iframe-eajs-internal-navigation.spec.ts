import { expect, test } from "../support/fixtures";
import {
  JWT_SHARED_SECRET,
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  getSimpleEmbedIframe,
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import {
  type ClickBehaviorFixture,
  getSignedJwtForResource,
  setupBrowserBreadcrumbs,
  setupClickBehaviorNavigation,
  waitForDashboardGet,
} from "../support/sdk-iframe-eajs-internal-navigation";
import { waitForDashCardQuery } from "../support/sdk-iframe-embedding";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/eajs-internal-navigation.cy.spec.ts
 *
 * (Group A — the embed.js harness, `support/sdk-iframe.ts`, consumed read-only.)
 *
 * Port notes:
 *
 * - `cy.wait("@getDashCardQuery")` / `@getDashboard` are aliases registered by
 *   `H.prepareSdkIframeEmbedTest`. The Playwright harness deliberately does not
 *   register them (PORTING rule 2), so each test arms its own wait immediately
 *   before the triggering action. `waitForDashCardQuery` is imported from
 *   `support/sdk-iframe-embedding.ts` rather than re-declared — it is already
 *   duplicated between that module and `sdk-iframe-embed-options.spec.ts`, and
 *   a third copy is not wanted (flagged for consolidation into
 *   `support/sdk-iframe.ts`).
 *
 * - `H.getSimpleEmbedIframeContent()` blocks until the embed iframe exists and
 *   its body is non-empty; the Playwright `getSimpleEmbedIframe` returns a lazy
 *   `FrameLocator` immediately. Every test therefore calls
 *   `waitForSimpleEmbedIframesToLoad` to restore that gate. This matters most
 *   for the many `should("not.exist")` checks — these retry but pass on the
 *   first absent poll, so they are only meaningful once the thing that *would*
 *   contain the element has rendered. `expect(loc).toHaveCount(0)` has the
 *   identical semantics and is the faithful port; the anchor, not the
 *   assertion form, is what makes them non-vacuous. (See PORTING.md — an
 *   earlier revision used a non-retrying `count()`, which is stricter than
 *   upstream and can go falsely red on an in-place re-render.)
 *
 * - **Navigation-specific hazard.** A locator resolved before an internal
 *   navigation can point at a *reused* React node that now says something else
 *   ("a list that re-renders under a resolved locator", PORTING) — Mantine
 *   `Breadcrumbs` anchors are a known instance. Every click that follows a
 *   navigation here is therefore gated on the settled post-navigation state
 *   (the awaited response, plus a visibility assertion on the crumb/back button
 *   that only exists in the settled trail) before the locator is resolved.
 *
 * - The internal navigation is client-side routing *inside* the embed iframe,
 *   not a document navigation, so the frame document is not replaced.
 *   `FrameLocator` re-resolves per action regardless, so the same handle stays
 *   valid — which is exactly what upstream relies on by re-calling
 *   `H.getSimpleEmbedIframeContent()` at each step.
 *
 * - No `test.skip` gates: the whole file runs on a bleeding-edge token, which
 *   the spike backend has. 6 tests, 6 executed.
 */

test.describe("scenarios > embedding > sdk iframe embedding > internal-navigation", () => {
  test.describe("click behavior navigation", () => {
    let fixture: ClickBehaviorFixture;

    test.beforeEach(async ({ page, mb }) => {
      await prepareSdkIframeEmbedTest(page, mb, { withToken: "bleeding-edge" });
      fixture = await setupClickBehaviorNavigation(mb.api);
    });

    test("should navigate to a linked dashboard with filters when clicking a dashboard link", async ({
      page,
      mb,
    }) => {
      const dashCardQuery = waitForDashCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}
          <metabase-dashboard dashboard-id="${fixture.startingDashboardId}" drills enable-entity-navigation />
        `,
      );

      await dashCardQuery;
      await waitForSimpleEmbedIframesToLoad(page);

      const frame = getSimpleEmbedIframe(page);

      // click on the dashboard link
      const dashboardLink = frame
        .getByText("Go to Target Dashboard", { exact: true })
        .first();
      await expect(dashboardLink).toBeVisible({ timeout: 40_000 });

      const getDashboard = waitForDashboardGet(page);
      await dashboardLink.click();
      await getDashboard;

      // verify we navigated to Target Dashboard
      await expect(
        frame.getByText("Target Dashboard", { exact: true }),
      ).toBeVisible();

      // verify the filter was passed
      await expect(
        frame
          .getByTestId("dashboard-parameters-widget-container")
          .getByLabel("ID Filter"),
      ).toContainText("1");

      // verify back button and navigate back
      const backButton = frame.getByText("Back to Starting Dashboard", {
        exact: true,
      });
      await expect(backButton).toBeVisible();
      await backButton.click();

      // verify we returned to Starting Dashboard
      await expect(
        frame.getByText("Starting Dashboard", { exact: true }),
      ).toBeVisible();
      // absence check, anchored on the Starting Dashboard having rendered
      await expect(frame.getByText(/Back to/)).toHaveCount(0);
    });

    test("should navigate to a linked question with parameters when clicking a question link", async ({
      page,
      mb,
    }) => {
      const dashCardQuery = waitForDashCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}
          <metabase-dashboard dashboard-id="${fixture.startingDashboardId}" drills enable-entity-navigation />
        `,
      );

      await dashCardQuery;
      await waitForSimpleEmbedIframesToLoad(page);

      const frame = getSimpleEmbedIframe(page);

      // click on the question link
      const questionLink = frame
        .getByText("Go to Native Question", { exact: true })
        .first();
      await expect(questionLink).toBeVisible({ timeout: 40_000 });
      await questionLink.click();

      // verify the question loaded
      await expect(frame.getByTestId("query-visualization-root")).toBeVisible({
        timeout: 40_000,
      });

      // verify back button is visible
      await expect(
        frame.getByText("Back to Starting Dashboard", { exact: true }),
      ).toBeVisible();
    });

    test("should not navigate when drills are disabled", async ({
      page,
      mb,
    }) => {
      const dashCardQuery = waitForDashCardQuery(page);

      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}
          <metabase-dashboard dashboard-id="${fixture.startingDashboardId}" drills="false" enable-entity-navigation />
        `,
      );

      await dashCardQuery;
      await waitForSimpleEmbedIframesToLoad(page);

      const frame = getSimpleEmbedIframe(page);

      // click on a cell that has click behavior configured
      const cell = frame.getByText("37.65", { exact: true }).first();
      await expect(cell).toBeVisible({ timeout: 40_000 });
      await cell.click();

      // no drill popover should appear (drills are disabled: steady state)
      await expect(frame.getByText(/Filter by this value/)).toHaveCount(0);

      // no navigation should happen
      await expect(
        frame.getByText("Target Dashboard", { exact: true }),
      ).toHaveCount(0);
      await expect(frame.getByText(/Back to/)).toHaveCount(0);
    });

    test("should not support internal navigation on guest embeds", async ({
      page,
      mb,
    }) => {
      // Enable guest embedding settings
      await mb.api.put("/api/setting/enable-embedding-simple", { value: true });
      await mb.api.put("/api/setting/enable-embedding-static", { value: true });
      await mb.api.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

      const token = getSignedJwtForResource({
        resourceId: fixture.startingDashboardId,
        resourceType: "dashboard",
      });

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        metabaseConfig: { isGuest: true },
        elements: [
          {
            component: "metabase-dashboard",
            attributes: { token, drills: true },
          },
        ],
      });

      await waitForSimpleEmbedIframesToLoad(page);

      // dashboard should render
      await expect(
        frame.getByText("Orders for Starting Dashboard", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      // click behavior link text should not be shown, actual data values
      // should be visible instead
      await expect(
        frame.getByText("Go to Target Dashboard", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("<metabase-browser> breadcrumbs", () => {
    test.beforeEach(async ({ page, mb }) => {
      await prepareSdkIframeEmbedTest(page, mb, { withToken: "bleeding-edge" });
      await setupBrowserBreadcrumbs(mb.api);
    });

    test("should hide breadcrumbs during internal navigation and show them again after going back", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}
          <metabase-browser initial-collection="root" enable-entity-navigation />
        `,
      );

      await waitForSimpleEmbedIframesToLoad(page);

      const frame = getSimpleEmbedIframe(page);
      const breadcrumbs = frame.getByTestId("sdk-breadcrumbs");

      // click on the dashboard to open it
      const dashboardItem = frame.getByText("First Dashboard", { exact: true });
      await expect(dashboardItem).toBeVisible({ timeout: 40_000 });

      const dashCardQuery = waitForDashCardQuery(page);
      await dashboardItem.click();
      await dashCardQuery;

      // breadcrumbs should be visible
      await expect(breadcrumbs).toBeVisible();

      // no back button should exist
      await expect(frame.getByText(/Back to/)).toHaveCount(0);

      // click on click behavior link to trigger internal navigation
      const targetLink = frame
        .getByText("Go to Target Dashboard", { exact: true })
        .first();
      await expect(targetLink).toBeVisible({ timeout: 40_000 });
      await targetLink.click();

      // back button should be visible.
      //
      // Reordered ahead of the breadcrumb-absence check below: upstream takes
      // the `should("not.exist")` first, but that check passes at its FIRST
      // absent observation, so taken mid-navigation it is satisfied by any
      // instant in which the breadcrumbs happen not to be mounted (true of
      // both retrying and non-retrying forms). Anchoring on the back button —
      // which only exists once the internal navigation has landed — makes the
      // absence check assert the post-navigation state it is about.
      const backButton = frame.getByText("Back to First Dashboard", {
        exact: true,
      });
      await expect(backButton).toBeVisible({ timeout: 40_000 });

      // breadcrumbs should be hidden after navigating
      await expect(breadcrumbs).toHaveCount(0);

      await backButton.click();

      // verify we returned to First Dashboard
      // (breadcrumbs and the dashboard heading)
      await expect(
        frame.getByText("First Dashboard", { exact: true }),
      ).toHaveCount(2);

      // breadcrumbs should be visible again
      await expect(breadcrumbs).toBeVisible();

      // back button should be gone
      await expect(frame.getByText(/Back to/)).toHaveCount(0);
    });

    test("should clean up navigation stack when clicking a collection breadcrumb after navigating back", async ({
      page,
      mb,
    }) => {
      await visitCustomHtmlPage(
        page,
        mb,
        `
          ${getNewEmbedScriptTag(mb)}
          ${getNewEmbedConfigurationScript(mb, {})}
          <metabase-browser initial-collection="root" enable-entity-navigation />
        `,
      );

      await waitForSimpleEmbedIframesToLoad(page);

      const frame = getSimpleEmbedIframe(page);
      const breadcrumbs = frame.getByTestId("sdk-breadcrumbs");

      // open First Dashboard from the browser
      const dashboardItem = frame.getByText("First Dashboard", { exact: true });
      await expect(dashboardItem).toBeVisible({ timeout: 40_000 });

      const firstDashCardQuery = waitForDashCardQuery(page);
      await dashboardItem.click();
      await firstDashCardQuery;

      // navigate to Target Dashboard via click behavior link
      const targetLink = frame
        .getByText("Go to Target Dashboard", { exact: true })
        .first();
      await expect(targetLink).toBeVisible({ timeout: 40_000 });

      const getDashboard = waitForDashboardGet(page);
      await targetLink.click();
      await getDashboard;

      // click back to return to First Dashboard
      const backButton = frame.getByText("Back to First Dashboard", {
        exact: true,
      });
      await expect(backButton).toBeVisible({ timeout: 40_000 });
      await backButton.click();

      // click 'Our analytics' breadcrumb to go back to the collection browser.
      //
      // Gate on the SETTLED trail before resolving the crumb: React reuses the
      // Breadcrumbs anchor nodes while swapping the trail contents, so a
      // locator resolved against a half-restored trail can point at a node
      // that becomes a different crumb by click time. The trail is settled once
      // it carries both "Our analytics" and "First Dashboard".
      await expect(breadcrumbs).toBeVisible({ timeout: 40_000 });
      await expect(
        breadcrumbs.getByText("First Dashboard", { exact: true }),
      ).toBeVisible();
      await breadcrumbs.getByText("Our analytics", { exact: true }).click();

      // verify the collection browser is showing items again
      await expect(
        frame.getByText("First Dashboard", { exact: true }),
      ).toBeVisible();

      // verify no back button is present (navigation stack should be clean)
      await expect(frame.getByText(/Back to/)).toHaveCount(0);

      // verify we can navigate to a dashboard again (no stale virtual entries)
      const secondDashCardQuery = waitForDashCardQuery(page);
      await frame.getByText("First Dashboard", { exact: true }).click();
      await secondDashCardQuery;

      await expect(
        breadcrumbs.getByText("First Dashboard", { exact: true }),
      ).toBeVisible();
    });
  });
});
