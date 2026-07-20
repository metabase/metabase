import type { Page } from "@playwright/test";

import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "../support/command-palette";
import { publishChanges } from "../support/embedding-dashboard";
import { expect, test } from "../support/fixtures";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  getEmbedSidebar,
  loadedPreviewIframe,
  navigateToEntitySelectionStep,
  navigateToGetCodeStep,
  visitNewEmbedPage,
  waitForWizardDashboard,
} from "../support/sdk-embed-setup";
import {
  enableJwtAuth,
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { installSnowplowCapture } from "../support/search-snowplow";
import { openSharingMenu } from "../support/sharing";
import { modal, visitQuestion } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/common-ee.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only and needed no changes; like the last two landed Group B specs there
 * is no companion support module — every helper this spec needs already exists.
 *
 * TIER (this is the `-ee` half of an `-ee`/`-oss-and-starter` pair).
 * There is no `@OSS` tag and no EE-only describe: upstream's entire EE-ness is
 * `H.activateToken("pro-self-hosted")`, so there is nothing to `test.skip` and
 * all 8 tests execute. The gate is an ASSERTION gate — "allows to select the
 * `Metabase Account` item even when simple embedding setting is disabled"
 * asserts the SSO radio is **enabled** on exactly the setup where
 * `common-oss-and-starter.cy.spec.ts` asserts it is **disabled**
 * ("does not allow to select the `Metabase Account`, when token feature is
 * missing (oss)"). Reflexively skipping would delete the only assertion that
 * distinguishes the two files. That test therefore doubles as a live check that
 * `activateToken` really took (it PUTs with `failOnStatusCode: false`, so "it
 * didn't throw" proves nothing) — see findings.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header):
 *   the wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`.
 * - SNOWPLOW is not the subject here — no `expectUnstructuredSnowplowEvent`,
 *   and no `afterEach(H.expectNoBadSnowplowEvents)` either. `H.enableTracking()`
 *   is still ported as the `anon-tracking-enabled` setting so backend state
 *   matches upstream, and `installSnowplowCapture` is installed *only* to keep
 *   that from firing real analytics: on a clean jar boot `snowplow-available`
 *   defaults true and `snowplow-url` defaults to `https://sp.metabase.com`, so a
 *   tracking-enabled jar run would POST to Metabase's production collector. The
 *   capture re-points the collector at the app's own origin, client-side.
 *   Nothing asserts on it. (Measured caveat: the slot backend this was verified
 *   on happened to carry a leaked `MB_SNOWPLOW_URL=http://localhost:9090` in its
 *   process env, so the production URL was not in play *there* — the capture is
 *   the guard for the clean-boot case, and per PORTING.md a leaked
 *   `MB_SNOWPLOW_*` is a non-issue for this technique either way.)
 * - `cy.intercept("GET", "/api/dashboard/**").as("dashboard")` in the
 *   `beforeEach` is awaited by exactly one test ("navigating back in browser
 *   history"); per rule 2 it is armed there, immediately before the click that
 *   triggers it, using the shared `waitForWizardDashboard`. It is dropped
 *   everywhere else (never awaited).
 * - `getEmbedSidebar()` upstream is `modal().first().within(() => …)`, and
 *   Cypress's `.within()` **yields its original subject** — so the sidebar
 *   helper actually yields the *modal*, and `getEmbedSidebar().within(…)` scopes
 *   to the whole wizard modal, not to the `<aside>`. That matters only in the
 *   last test, whose `within` block reaches for the preview **iframe** (which
 *   lives in the modal but outside the aside). The port keeps the shared
 *   (aside-scoped) `getEmbedSidebar` for the radio labels and uses the
 *   page-scoped iframe helpers for the iframe — resolving the same elements
 *   upstream does. Everywhere else the two scopes are interchangeable.
 * - `cy.findAllByTestId(X).should("be.visible")` is an ANY-of-set assertion
 *   (rule 3) → `.filter({ visible: true }).first()`.
 * - ABSENCE: `H.modal().should("not.exist")` → retrying `toHaveCount(0)`, the
 *   faithful equivalent. Not vacuous: in all three cases the page underneath
 *   (`/admin/embedding`, with its `sdk-setting-card`s) was already rendered
 *   before the modal opened, and upstream's own following assertion on those
 *   cards is kept as the positive anchor.
 */

const DASHBOARD_NAME = "Orders in a dashboard";

const SSO_LABEL = "Metabase account (SSO)";
const GUEST_LABEL = "Guest";

/** Port of `cy.findAllByTestId("sdk-setting-card").should("be.visible")`. */
function visibleSdkSettingCard(page: Page) {
  return page
    .getByTestId("sdk-setting-card")
    .filter({ visible: true })
    .first();
}

/**
 * Port of
 * `cy.findAllByTestId("settings-sidebar-link").contains("General")`.
 * `cy.contains` is a case-sensitive substring taking the first match (rule 1).
 */
function generalSettingsLink(page: Page) {
  return page
    .getByTestId("settings-sidebar-link")
    .filter({ hasText: /General/ })
    .first();
}

test.describe("scenarios > embedding > sdk iframe embed setup > common", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);
    await mb.api.updateSetting("show-simple-embed-terms", false);
    await mb.api.updateSetting("enable-embedding-static", true);
    await mb.api.updateSetting("show-static-embed-terms", false);

    await installSnowplowCapture(page, mb.baseUrl);
  });

  test("should close wizard when clicking `close` button on the modal", async ({
    page,
  }) => {
    await navigateToEntitySelectionStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    await modal(page).first().locator("[aria-label='Close']").click();

    await expect(modal(page)).toHaveCount(0);
    await expect(visibleSdkSettingCard(page)).toBeVisible();
  });

  test("should close wizard when clicking `Done` button on the last step", async ({
    page,
  }) => {
    await navigateToGetCodeStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectGuest: true,
    });

    await publishChanges(page, "dashboard");

    await expect(
      page.getByRole("button", { name: "Unpublish", exact: true }),
    ).toBeVisible();

    await getEmbedSidebar(page).getByText("Done", { exact: true }).click();

    await expect(modal(page)).toHaveCount(0);
    await expect(visibleSdkSettingCard(page)).toBeVisible();
  });

  test("should close wizard when navigating back in browser history", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(generalSettingsLink(page)).toBeVisible();

    await page.goto("/admin/embedding");
    await expect(visibleSdkSettingCard(page)).toBeVisible();

    // Rule 2: the beforeEach's `@dashboard` intercept, armed at its real
    // trigger.
    const dashboard = waitForWizardDashboard(page);

    await page
      .getByTestId("sdk-setting-card")
      .first()
      .getByText("New embed", { exact: true })
      .click();

    await dashboard;

    await expect(loadedPreviewIframe(page)).toHaveCount(1, { timeout: 20_000 });

    await expect(modal(page).first()).toBeAttached();

    await page.goBack();

    await expect(modal(page)).toHaveCount(0);
    await expect(generalSettingsLink(page)).toBeVisible();
  });

  test.describe("auth type switch", () => {
    test("allows to select the `guest` item even when static embedding setting is disabled", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-static", false);

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

      await visitNewEmbedPage(page, { waitForResource: false });

      await expect(page.getByLabel(GUEST_LABEL, { exact: true })).toBeEnabled();
    });

    test("allows to select the `Metabase Account` item even when simple embedding setting is disabled", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("enable-embedding-simple", false);

      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);

      await visitNewEmbedPage(page, { waitForResource: false });

      await expect(page.getByLabel(SSO_LABEL, { exact: true })).toBeEnabled();
    });

    test.describe("default auth mode follows SSO configuration", () => {
      const openFromCommandPalette = async (page: Page) => {
        await page.goto("/");
        await commandPaletteButton(page).click();
        // `cy.type()` clicks its subject first; the palette input is already
        // mounted and autofocused by the button click, but the click is kept
        // so the port stays literal. Real keystrokes (not `fill`) because the
        // action list is filtered as you type.
        await expect(commandPaletteInput(page)).toBeVisible();
        await commandPaletteInput(page).click();
        await commandPaletteInput(page).pressSequentially("new embed");

        const option = commandPalette(page).getByRole("option", {
          name: "New embed",
          exact: true,
        });
        await expect(option).toBeVisible();
        await option.click();
      };

      const openFromAdminEmbedding = async (page: Page) => {
        await page.goto("/admin/embedding");
        await page
          .getByTestId("sdk-setting-card")
          .first()
          .getByText("New embed", { exact: true })
          .click();
      };

      const openFromAdminGuestEmbeds = async (page: Page) => {
        await page.goto("/admin/embedding/guest");
        await page
          .getByTestId("guest-embeds-setting-card")
          .first()
          .getByText("New embed", { exact: true })
          .click();
      };

      const openFromSharingMenu = async (page: Page) => {
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openSharingMenu(page, "Embed");
      };

      const assertCheckedAuth = async (page: Page, mode: "sso" | "guest") => {
        const sidebar = getEmbedSidebar(page);
        await expect(
          sidebar.getByLabel(mode === "sso" ? SSO_LABEL : GUEST_LABEL, {
            exact: true,
          }),
        ).toBeChecked();
        await expect(
          sidebar.getByLabel(mode === "sso" ? GUEST_LABEL : SSO_LABEL, {
            exact: true,
          }),
        ).not.toBeChecked();
      };

      test("defaults to SSO from non-guest entry points when JWT SSO is configured (EMB-1783)", async ({
        page,
        mb,
      }) => {
        await enableJwtAuth(mb);

        await openFromCommandPalette(page);
        await assertCheckedAuth(page, "sso");

        await openFromAdminEmbedding(page);
        await assertCheckedAuth(page, "sso");

        await openFromSharingMenu(page);
        await assertCheckedAuth(page, "sso");

        // The Guest embeds admin section is intentionally guest-only and
        // forces guest mode regardless of SSO configuration.
        await openFromAdminGuestEmbeds(page);
        await assertCheckedAuth(page, "guest");
      });

      test("defaults to Guest from all entry points when SSO is not configured", async ({
        page,
      }) => {
        await openFromCommandPalette(page);
        await assertCheckedAuth(page, "guest");

        await openFromAdminEmbedding(page);
        await assertCheckedAuth(page, "guest");

        await openFromSharingMenu(page);
        await assertCheckedAuth(page, "guest");

        await openFromAdminGuestEmbeds(page);
        await assertCheckedAuth(page, "guest");
      });
    });

    test("should not reset experience when changing auth type for Embed JS wizard opened from an entity page", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await openSharingMenu(page, "Embed");

      const sidebar = getEmbedSidebar(page);

      // Upstream wraps all of this in `getEmbedSidebar().within()`, which
      // (see header) scopes to the wizard MODAL, not the aside — the iframe
      // helpers below are page-scoped for exactly that reason.
      await waitForSimpleEmbedIframesToLoad(page);

      await expect(
        getSimpleEmbedIframe(page).getByText("Orders", { exact: true }),
      ).toBeVisible();

      await sidebar.getByLabel(SSO_LABEL, { exact: true }).click();

      await waitForSimpleEmbedIframesToLoad(page);

      await expect(
        getSimpleEmbedIframe(page).getByText("Orders", { exact: true }),
      ).toBeVisible();

      await sidebar.getByLabel(GUEST_LABEL, { exact: true }).click();

      await waitForSimpleEmbedIframesToLoad(page);

      await expect(
        getSimpleEmbedIframe(page).getByText("Orders", { exact: true }),
      ).toBeVisible();
    });
  });
});
