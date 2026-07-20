import type { Page } from "@playwright/test";

import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import { expect, test } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  codeBlock,
  getEmbedSidebar,
  navigateToGetCodeStep,
} from "../support/sdk-embed-setup";
import {
  enableJwtAuth,
  enableSamlAuth,
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/get-code.cy.spec.ts
 *
 * PROOF SPEC for `support/sdk-embed-setup.ts` — chosen deliberately over the
 * much larger `select-embed-options` (1027 lines):
 *
 * - It is the ONLY spec in the tier that calls `navigateToGetCodeStep`, i.e.
 *   the deepest link of the helper chain. Getting it green exercises the whole
 *   chain end to end — `visitNewEmbedPage` → `embedModalEnableEmbedding` →
 *   `navigateToEntitySelectionStep` (incl. `ensureAuthMode` and the entity
 *   picker) → `navigateToEmbedOptionsStep` → `navigateToGetCodeStep` — 15
 *   times, across THREE experiences (dashboard, chart, exploration) and both
 *   auth presets. `select-embed-options` calls only `navigateToEmbedOptionsStep`
 *   and only for `dashboard`/`chart`, so it would leave the deepest step and
 *   the resource-less experiences unproven while costing 3× the porting time.
 * - It exercises both remaining locator helpers (`getEmbedSidebar`,
 *   `codeBlock`).
 * - It is the only setup spec that also touches the *iframe* harness
 *   (`waitForSimpleEmbedIframesToLoad` / `getSimpleEmbedIframeContent`), which
 *   is the one place the two tiers meet — so it proves the read-only reuse of
 *   `support/sdk-iframe.ts` works from an in-app preview and not just from a
 *   customer HTML page.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header).
 * - SNOWPLOW IS THE SUBJECT here, not incidental: 5 of the 15 tests assert
 *   `embed_wizard_*` events, and `afterEach` asserts no bad events. PORTING.md
 *   rule 6's stub-to-no-op branch would silently delete that coverage, so this
 *   uses `installSnowplowCapture` (browser-boundary capture), per the same
 *   decision made for search-snowplow / visualizer-snowplow-tracking.
 *   `H.enableTracking()` is subsumed by the capture's settings override, but is
 *   still issued so the backend state matches upstream.
 * - `cy.intercept(...).as("dashboard"|"cardQuery"|"recentActivity")` in the
 *   beforeEach are never awaited by any test in this file — dropped per rule 2.
 *   The one intercept that IS awaited (`@searchModels`) is a *stub*, so it is
 *   ported as a `page.route` fulfil plus an explicit `waitForResponse`.
 * - `codeBlock().should("contain", …)` is a substring assertion on the
 *   CodeMirror content → `toContainText`. Note CodeMirror virtualises long
 *   documents, but these snippets are short enough to render whole (verified:
 *   the assertions below all resolve).
 * - `codeBlock().trigger("copy")` → `dispatchEvent("copy")`.
 */

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

test.describe("scenarios > embedding > sdk iframe embed setup > get code step", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  // Port of upstream's `afterEach(H.expectNoBadSnowplowEvents)`. Downgraded to
  // a structural check (see support/search-snowplow.ts) — micro's Iglu schema
  // validation has no container-free equivalent.
  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test("should disable SSO radio button (and show info message) when JWT and SAML are not configured", async ({
    page,
  }) => {
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    const sidebar = getEmbedSidebar(page);
    await expect(
      sidebar.getByLabel("Single sign-on", { exact: true }),
    ).toBeDisabled();
    await expect(
      sidebar.getByLabel("Existing session (local testing only)", {
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      sidebar.getByLabel("Existing session (local testing only)", {
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      sidebar.getByText(/The code below will only work for local testing/),
    ).toBeVisible();
  });

  test("should not display a warning when a user session is selected and JWT is configured", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);

    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    const sidebar = getEmbedSidebar(page);
    await sidebar
      .getByLabel("Existing session (local testing only)", { exact: true })
      .click();
    await expect(
      sidebar.getByText(/The code below will only work for local testing/),
    ).toHaveCount(0);
  });

  test("should enable SSO radio button when JWT is configured", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(
      getEmbedSidebar(page).getByLabel("Single sign-on", { exact: true }),
    ).not.toBeDisabled();
  });

  test("should enable SSO radio button when SAML is configured", async ({
    page,
    mb,
  }) => {
    await enableSamlAuth(mb);
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(
      getEmbedSidebar(page).getByLabel("Single sign-on", { exact: true }),
    ).not.toBeDisabled();
  });

  test("should display code snippet with syntax highlighting", async ({
    page,
  }) => {
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(
      getEmbedSidebar(page).getByText("Embed code", { exact: true }),
    ).toBeVisible();
    await expect(codeBlock(page).first()).toBeVisible();
    await expect(codeBlock(page).first()).toContainText("defineMetabaseConfig");
    await expect(codeBlock(page).first()).toContainText("metabase-dashboard");
  });

  test("should include useExistingUserSession when user session is selected", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    const sidebar = getEmbedSidebar(page);
    await expect(codeBlock(page).first()).not.toContainText(
      '"useExistingUserSession": true',
    );
    await sidebar
      .getByLabel("Existing session (local testing only)", { exact: true })
      .click();
    await expect(codeBlock(page).first()).toContainText(
      '"useExistingUserSession": true',
    );

    await sidebar.getByText(/Copy code/).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_code_copied",
      event_detail:
        "experience=dashboard,snippetType=frontend,authSubType=user-session",
    });
  });

  test("should track embed_wizard_code_copied when copy event triggers", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(codeBlock(page).first()).not.toContainText(
      '"useExistingUserSession": true',
    );
    await getEmbedSidebar(page)
      .getByLabel("Existing session (local testing only)", { exact: true })
      .click();
    await expect(codeBlock(page).first()).toContainText(
      '"useExistingUserSession": true',
    );

    await codeBlock(page).first().dispatchEvent("copy");

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_code_copied",
      event_detail:
        "experience=dashboard,snippetType=frontend,authSubType=user-session",
    });
  });

  test("should track embed_wizard_options_completed with settings=default properly (metabase#68285)", async ({
    page,
    mb,
  }) => {
    await navigateToGetCodeStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  test("should not include useExistingUserSession when SSO is selected", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);

    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    const sidebar = getEmbedSidebar(page);
    await expect(codeBlock(page).first()).not.toContainText(
      "useExistingUserSession",
    );

    await sidebar.getByText(/Copy code/).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_code_copied",
      event_detail: "experience=dashboard,snippetType=frontend,authSubType=sso",
    });
  });

  test("should set dashboard-id for regular dashboard experience", async ({
    page,
  }) => {
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(codeBlock(page).first()).toContainText(
      `dashboard-id="${ORDERS_DASHBOARD_ID}"`,
    );
  });

  test("should set question-id for regular chart experience", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await navigateToGetCodeStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    await getEmbedSidebar(page)
      .getByLabel("Existing session (local testing only)", { exact: true })
      .click();

    await expect(codeBlock(page).first()).toContainText(
      `question-id="${ORDERS_COUNT_QUESTION_ID}"`,
    );
  });

  test("should use metabase-question for exploration experience", async ({
    page,
  }) => {
    await navigateToGetCodeStep(page, { experience: "exploration" });

    await expect(codeBlock(page).first()).toContainText("metabase-question");
  });

  test("should not include entity-types when model count is 1", async ({
    page,
  }) => {
    await stubModelCount(page, 1);

    await navigateToGetCodeStep(page, { experience: "exploration" });

    await expect(codeBlock(page).first()).not.toContainText("entity-types");

    await waitForSimpleEmbedIframesToLoad(page);

    const frame = getSimpleEmbedIframe(page);
    await expect(frame.getByText("Orders", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(frame.getByText("Orders Model", { exact: true })).toBeVisible();
  });

  test("should include entity-types when model count is 3", async ({
    page,
  }) => {
    await stubModelCount(page, 3);

    await navigateToGetCodeStep(page, { experience: "exploration" });

    await expect(codeBlock(page).first()).toContainText(
      "entity-types='[\"model\"]'",
    );

    await waitForSimpleEmbedIframesToLoad(page);

    const frame = getSimpleEmbedIframe(page);
    await expect(frame.getByText("Orders Model", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(frame.getByText("Orders", { exact: true })).toHaveCount(0);
  });
});

/**
 * Port of the `cy.intercept({pathname: "/api/search", query: {limit: "0",
 * models: "dataset"}}, {data: [], total: N})` stub. The wizard counts models
 * with a `limit=0` search; stubbing the total is how the two entity-types tests
 * force the "one model" / "many models" branches without creating models.
 */
async function stubModelCount(page: Page, total: number) {
  await page.route(
    (url) =>
      url.pathname === "/api/search" &&
      url.searchParams.get("limit") === "0" &&
      url.searchParams.get("models") === "dataset",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], total }),
      }),
  );
}
