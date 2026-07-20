import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import {
  embedModalEnableEmbedding,
  getEmbedSidebar,
} from "../support/sdk-embed-setup";
import {
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { openSharingMenu } from "../support/sharing";
import { codeMirrorValue } from "../support/snippets";
import { visitDashboard, visitQuestion } from "../support/ui";

/**
 * Port of e2e/test/scenarios/sharing/public-sharing-embed-flow.cy.spec.ts
 *
 * The whole helper surface this spec needs was already ported by its siblings
 * and is consumed read-only here:
 * - `getEmbedSidebar` / `embedModalEnableEmbedding` — support/sdk-embed-setup.ts
 *   (upstream imports `getEmbedSidebar` straight from the
 *   `sdk-iframe-embedding-setup/helpers` barrel, which is exactly what that
 *   module ports).
 * - `waitForSimpleEmbedIframesToLoad` / `getSimpleEmbedIframe` —
 *   support/sdk-iframe.ts.
 * - `openSharingMenu`, `codeMirrorValue`, `visitDashboard`, `visitQuestion`.
 * Nothing new was needed, so there is no support/public-sharing-embed-flow.ts.
 *
 * Port notes:
 * - SNOWPLOW IS THE SUBJECT for two of the three tests (`embed_wizard_opened`,
 *   `embed_wizard_options_completed`), so PORTING rule 6's no-op stub is wrong
 *   here — this uses the browser-boundary `installSnowplowCapture`, the same
 *   decision the neighbouring sdk-embed-setup-get-code port made.
 *   `H.enableTracking()` is subsumed by the capture's client-side override but
 *   is still issued so the backend state matches upstream.
 *   `H.expectNoBadSnowplowEvents()` degrades to the structural check (no Iglu
 *   validation without micro) — stated, not hidden.
 * - `H.codeMirrorValue()` is page-wide upstream (`cy.get(".cm-line")`); the
 *   shared port takes a scope, so `page.locator("body")` reproduces it. It is
 *   wrapped in `expect.poll` because the generated snippet recompiles
 *   asynchronously after "publish this dashboard" — upstream's `.should()`
 *   after a `.then()` is effectively one-shot, so this is a deliberate (small)
 *   strengthening in the *safe* direction.
 * - `getEmbedSidebar().findByText("Back").should("not.exist")` is a ONE-SHOT
 *   absence check in Cypress, so it is ported as a non-retrying `count()`
 *   taken at a defined instant (after the embed preview has rendered), not as
 *   a retrying `toHaveCount(0)`. The `getEmbedSidebar()` anchor also carries an
 *   implicit existence assertion — kept as an explicit `toBeVisible()` first.
 * - No EE gate. The spike backend is the EE jar and `activateToken` succeeds,
 *   so all three tests really execute.
 */

const suiteTitle = "scenarios > sharing > embed flow pre-selection";

/**
 * Port of the spec-local `optionCardsWrapper`:
 *   getEmbedSidebar().findByText("Behavior").closest("[style*='opacity']")
 *
 * `.closest()` has no Playwright equivalent; the `ancestor-or-self` axis is a
 * reverse axis, so `[1]` is the NEAREST matching ancestor — the same element
 * jQuery's `.closest()` resolves.
 */
function optionCardsWrapper(page: Page): Locator {
  return getEmbedSidebar(page)
    .getByText("Behavior", { exact: true })
    .locator("xpath=ancestor-or-self::*[contains(@style,'opacity')][1]");
}

/** `should("have.css", "pointer-events", <value>)` — Cypress retries it, so
 * this polls the computed style rather than reading it once. */
async function expectPointerEvents(wrapper: Locator, value: string) {
  await expect
    .poll(() =>
      wrapper.evaluate((element) => getComputedStyle(element).pointerEvents),
    )
    .toBe(value);
}

test.describe(suiteTitle, () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // H.enableTracking()
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);

    // H.resetSnowplow() + the capture that stands in for micro.
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test("pre-selects dashboard in embed flow when opened from dashboard sharing modal", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await openSharingMenu(page, "Embed");
    await embedModalEnableEmbedding(page);

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_opened",
    });

    const sidebar = getEmbedSidebar(page);
    await expect(sidebar.getByText("Behavior", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Appearance", { exact: true })).toBeVisible();

    await waitForSimpleEmbedIframesToLoad(page);

    await expect(
      getSimpleEmbedIframe(page).getByText("Orders in a dashboard", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(sidebar).toBeVisible();
    expect(await sidebar.getByText("Back", { exact: true }).count()).toBe(0);

    await sidebar.getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  test("lets Guest embedding proceed after accepting only the Guest terms, without requiring the SSO terms (EMB-1884)", async ({
    page,
    mb,
  }) => {
    // Reproduce a fresh Pro instance where neither auth type's terms have
    // been accepted yet, so the option cards start dimmed.
    await mb.api.updateSetting("show-simple-embed-terms", true);
    await mb.api.updateSetting("show-static-embed-terms", true);
    await mb.api.updateSetting("enable-embedding-static", false);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await openSharingMenu(page, "Embed");

    // switch to Guest authentication
    await getEmbedSidebar(page).getByLabel("Guest", { exact: true }).click();

    // the Behavior options aren't interactive until the Guest terms are accepted
    await expectPointerEvents(optionCardsWrapper(page), "none");

    // accept the Guest terms only — never the SSO terms
    await embedModalEnableEmbedding(page);

    // the Behavior options become interactive without accepting the SSO terms
    await expectPointerEvents(optionCardsWrapper(page), "all");

    const sidebar = getEmbedSidebar(page);
    // Mantine Switch: click the input, not the label (PORTING rule 4).
    const allowDownloads = sidebar.getByLabel("Allow downloads", {
      exact: true,
    });
    await allowDownloads.click({ force: true });
    await expect(allowDownloads).toBeChecked();

    await sidebar.getByText("Get code", { exact: true }).click();
    await sidebar.getByText("publish this dashboard", { exact: true }).click();

    await expect
      .poll(() => codeMirrorValue(page.locator("body")))
      .toContain('with-downloads="true"');
  });

  test("pre-selects question in embed flow when opened from question sharing modal", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await openSharingMenu(page, "Embed");
    await embedModalEnableEmbedding(page);

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_opened",
    });

    const sidebar = getEmbedSidebar(page);
    await expect(sidebar.getByText("Behavior", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Appearance", { exact: true })).toBeVisible();

    await waitForSimpleEmbedIframesToLoad(page);

    await expect(
      getSimpleEmbedIframe(page).getByText("Orders", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(sidebar).toBeVisible();
    expect(await sidebar.getByText("Back", { exact: true }).count()).toBe(0);

    await sidebar.getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });
});
