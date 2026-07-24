import type { Page } from "@playwright/test";

// `hovercard` is the port of `H.hovercard()` (e2e-ui-elements-helpers.js,
// `.mb-mantine-HoverCard-dropdown[role='dialog']:visible`). It already exists
// in support/filter-bulk.ts with the `:visible` filter intact — the
// data-model.ts copy drops it — so this spec consumes that one read-only
// rather than adding a third.
import { hovercard } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { entityPickerModal } from "../support/notebook";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  embedModalEnableEmbeddingCard,
  getEmbedSidebar,
} from "../support/sdk-embed-setup";
import {
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { openSharingMenu } from "../support/sharing";
import { visitDashboard } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-flow-enable-embed-js-ee.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only and needed no changes, and — like the last five landed Group B
 * specs — there is no companion support module: every helper already exists.
 *
 * TIER. This is the `-ee` half of an `-ee` / `-oss-and-starter` pair, and the
 * EE-ness is **per-describe, not per-file**: `DATA_BY_EMBEDDING_TYPE.guest`
 * carries `token: null`, so the three `guest` tests run *unlicensed* upstream
 * too, exactly as they do here. Only the three `modular` tests activate
 * `bleeding-edge`. There is no `@OSS` tag and no EE-only describe, so nothing
 * is `test.skip`ped — all 7 tests execute.
 *
 * The gate is REAL for `modular` and INERT for `guest`, both measured by
 * removing `activateToken` and changing nothing else: all 3 `modular` tests
 * fail, all 4 unlicensed tests (3 `guest` + the top-level one) still pass.
 * `activateToken("bleeding-edge")` was verified to actually take — it PUTs with
 * `failOnStatusCode: false`, so "it didn't throw" proves nothing — by reading
 * `token-features` off `/api/session/properties`: 50+ features true under
 * `modular`, `{}` under `guest`.
 *
 * The failure MECHANISM is earlier than one might guess: unlicensed, the
 * `sdk-setting-card` on `/admin/embedding` renders no "New embed" button at
 * all, so the wizard never opens. (An earlier draft of this header claimed the
 * SSO radio renders *disabled*; that is what the `-oss-and-starter` sibling
 * asserts at its own entry point — `findByLabelText("Metabase account
 * (SSO)").should("be.disabled")`, line 180 — but it is NOT where this spec
 * dies. Corrected against the measured call log.)
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header):
 *   the wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`.
 * - `cy.trigger("mouseover"/"mouseout")` is a **synthetic** dispatch, not a
 *   real hover → `dispatchEvent`. That is both the faithful mapping and the
 *   safe one here: `UsageConditionsInfoIcon` is a Mantine `HoverCard` whose
 *   target gets React `onMouseEnter`/`onMouseLeave` props, and React
 *   synthesises those from delegated `mouseover`/`mouseout`, so the dispatch
 *   drives it exactly as Cypress does — while leaving the real cursor parked
 *   nowhere (the wave-9 parked-cursor tooltip trap).
 * - `getEmbedSidebar()` upstream is `modal().first().within(…)` and Cypress's
 *   `.within()` yields its ORIGINAL subject, so it really returns the modal.
 *   The two places this spec uses it (the "info icon", the absent card text)
 *   are both inside the `<aside>`, so the shared narrower helper resolves the
 *   same elements. Not widened.
 * - ABSENCE (three sites, all `should("not.exist")`) → retrying
 *   `toHaveCount(0)`, the faithful equivalent. Each is anchored on a positive
 *   signal, and each was mutation-proven non-vacuous — see findings for the
 *   two-batch table. Note the honest detail: the two card-text absences were
 *   proven by repointing the locator at text that IS rendered (a locator-target
 *   corruption), not by an input inversion — the state that would make
 *   `cardText` appear also changes the positive anchor, so it would kill at the
 *   anchor and leave the absence unproven. The status-bar absence is covered by
 *   an input inversion proper.
 */

const DATA_BY_EMBEDDING_TYPE = {
  guest: {
    path: "/admin/embedding/guest",
    token: null,
    authMethodLabel: "Guest",
    cardTestId: "guest-embeds-setting-card",
    cardText:
      "To continue, enable guest embeds and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-static",
    showTermsSettingName: "show-static-embed-terms",
    tooltipText:
      /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
  },
  modular: {
    path: "/admin/embedding",
    token: "bleeding-edge",
    authMethodLabel: "Metabase account (SSO)",
    cardTestId: "sdk-setting-card",
    cardText:
      "To continue, enable modular embedding and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-simple",
    showTermsSettingName: "show-simple-embed-terms",
    tooltipText: /Sharing Metabase accounts is a security risk/,
  },
} as const;

/** `cy.contains(str)` is a case-sensitive substring match (rule 1). */
function substring(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/**
 * Port of
 * `cy.findAllByTestId(cardTestId).first().within(() => cy.findByText("New embed").click())`.
 */
async function openNewEmbed(page: Page, cardTestId: string) {
  await page
    .getByTestId(cardTestId)
    .first()
    .getByText("New embed", { exact: true })
    .click();
}

function infoIcon(scope: ReturnType<typeof getEmbedSidebar>) {
  return scope.getByLabel("info icon", { exact: true });
}

test.describe("scenarios > embedding > sdk iframe embed setup > enable embed js (EE)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  for (const [key, value] of Object.entries(DATA_BY_EMBEDDING_TYPE)) {
    test.describe(key, () => {
      const {
        path,
        token,
        authMethodLabel,
        embeddingSettingName,
        showTermsSettingName,
        cardTestId,
        cardText,
        tooltipText,
      } = value;

      test.beforeEach(async ({ mb }) => {
        if (token) {
          await mb.api.activateToken(token);
        }
      });

      test("shows the Enable to Continue button and enables embedding on click", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting(embeddingSettingName, false);
        await mb.api.updateSetting(showTermsSettingName, true);

        await page.goto(path);

        await openNewEmbed(page, cardTestId);

        await page.getByLabel(authMethodLabel, { exact: true }).click();

        await expect(embedModalEnableEmbeddingCard(page)).toContainText(
          cardText,
        );

        // shows tooltip with fair usage info
        await infoIcon(embedModalEnableEmbeddingCard(page)).dispatchEvent(
          "mouseover",
        );

        await expect(hovercard(page).getByText(tooltipText)).toBeVisible();

        await infoIcon(embedModalEnableEmbeddingCard(page)).dispatchEvent(
          "mouseout",
        );

        const agreeAndEnable = page.getByRole("button", {
          name: "Agree and enable",
          exact: true,
        });

        await expect(agreeAndEnable).toBeVisible();

        // preview panel should show placeholder
        await expect(page.locator('[alt="No results"]')).toBeVisible();

        await agreeAndEnable.click();

        // button should change to Enabled state
        const enabled = page.getByRole("button", { name: /Enabled/ });
        await expect(enabled).toBeVisible();
        await expect(enabled).toBeDisabled();

        // Selecting "Orders in a dashboard" explicitly on the first step
        // because sometimes it selects another one that's been used recently
        // see EMB-1106
        await page.getByTestId("embed-browse-entity-button").click();
        await entityPickerModal(page)
          .getByText("Orders in a dashboard", { exact: true })
          .first()
          .click();

        // Preview should load after embedding is enabled
        await waitForSimpleEmbedIframesToLoad(page);
        await expect(
          getSimpleEmbedIframe(page).getByText("Orders in a dashboard", {
            exact: true,
          }),
        ).toBeVisible({ timeout: 60_000 });
      });

      test("shows the enable card with fair usage terms when embedding is already enabled", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting(embeddingSettingName, true);
        await mb.api.updateSetting(showTermsSettingName, true);

        await page.goto(path);

        await openNewEmbed(page, cardTestId);

        await page.getByLabel(authMethodLabel, { exact: true }).click();

        await expect(embedModalEnableEmbeddingCard(page)).toContainText(
          "Agree to the usage conditions to continue.",
        );

        // The assertion above is the positive anchor for this absence check:
        // the card has rendered its "already enabled" copy, so "the
        // not-yet-enabled copy is absent" is a real observation.
        await expect(
          embedModalEnableEmbeddingCard(page).getByText(cardText, {
            exact: true,
          }),
        ).toHaveCount(0);

        // shows tooltip with fair usage info
        await infoIcon(getEmbedSidebar(page)).dispatchEvent("mouseover");

        await expect(hovercard(page).getByText(tooltipText)).toBeVisible();
      });

      test("hides the enable card when embedding is already enabled", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting(embeddingSettingName, true);
        await mb.api.updateSetting(showTermsSettingName, false);

        await page.goto(path);

        await openNewEmbed(page, cardTestId);

        await page.getByLabel(authMethodLabel, { exact: true }).click();

        // Upstream's `getEmbedSidebar()` is `findByRole("complementary")`,
        // which throws when absent — that implicit existence assertion is the
        // anchor, and porting it explicitly keeps the absence check below from
        // passing on a page that never rendered.
        await expect(getEmbedSidebar(page)).toBeVisible();

        await expect(
          getEmbedSidebar(page).getByText(substring(cardText)),
        ).toHaveCount(0);
      });
    });
  }

  test("shows guest embed status bar when guest embedding is toggled from disabled to enabled state", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("enable-embedding-static", false);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await openSharingMenu(page, "Embed");

    const agreeAndEnable = page.getByRole("button", {
      name: "Agree and enable",
      exact: true,
    });

    // Anchor for the absence check: upstream's very next line clicks this
    // button, so asserting it is on screen first cannot weaken anything — it
    // just proves the embed modal finished rendering before we conclude the
    // status bar is missing.
    await expect(agreeAndEnable).toBeVisible();

    await expect(
      page.getByTestId("embed-modal-content-status-bar"),
    ).toHaveCount(0);

    await agreeAndEnable.click();

    await expect(
      page.getByTestId("embed-modal-content-status-bar"),
    ).toHaveCount(1);
  });
});
