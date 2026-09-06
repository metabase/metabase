import type { Page } from "@playwright/test";

// `hovercard` is the port of `H.hovercard()` (e2e-ui-elements-helpers.js,
// `.mb-mantine-HoverCard-dropdown[role='dialog']:visible`). It already exists
// in support/filter-bulk.ts with the `:visible` filter intact — the
// data-model.ts copy drops it — so this spec consumes that one read-only.
import { hovercard } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { entityPickerModal } from "../support/notebook";
import {
  embedModalEnableEmbeddingCard,
  getEmbedSidebar,
} from "../support/sdk-embed-setup";
import {
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-flow-enable-embed-js-oss-and-starter.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only; no companion support module — every helper already exists.
 *
 * TIER. This is the `-oss-and-starter` half of the pair whose `-ee` half is
 * `tests/sdk-embed-setup-embed-flow-enable-embed-js-ee.spec.ts`. As with the
 * `common-*` pair this is an ASSERTION gate, not a describe gate: the `@OSS`
 * tag on the first describe means "runs on an OSS build", and the only
 * mechanical difference between the two describes is whether
 * `activateToken("starter")` is called. Measured on this jar:
 *
 *   | tier           | enabled token-features                                             |
 *   | -------------- | ------------------------------------------------------------------ |
 *   | no token (OSS) | (none)                                                             |
 *   | starter        | config_text_file, hosting, offer-metabase-ai-managed, support-users |
 *
 * Neither set contains `embedding_simple`. That absence is the whole point of
 * the file's last test ("does not show the Enable to Continue button and
 * disables item"), which asserts the SSO radio is **disabled** on exactly the
 * setup where the `-ee` sibling's `modular` describe (token `bleeding-edge`)
 * drives the SSO flow to completion. So nothing is `test.skip`ped — all 8
 * tests execute — and skipping by reflex would delete the only assertion that
 * distinguishes this file from its EE counterpart.
 *
 * The precondition is ASSERTED, not assumed (PORTING.md: "activateToken didn't
 * throw" is not evidence, and neither is "we didn't call activateToken").
 * `mb.restore()` wipes `premium-embedding-token`; the beforeEach probe of
 * `/api/session/properties` proves it, per tier.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` dropped (see sdk-embed-setup.ts header): the
 *   wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`.
 * - `cy.trigger("mouseover"/"mouseout")` is a **synthetic** dispatch, not a
 *   real hover → `dispatchEvent`. Faithful and safe: `UsageConditionsInfoIcon`
 *   is a Mantine `HoverCard` whose target takes React
 *   `onMouseEnter`/`onMouseLeave`, and React synthesises those from delegated
 *   `mouseover`/`mouseout`, so the dispatch drives it exactly as Cypress does
 *   while leaving the real cursor parked nowhere.
 * - `getEmbedSidebar()` upstream is `modal().first().within(…)` and Cypress's
 *   `.within()` yields its ORIGINAL subject, so it really returns the modal.
 *   The one place this spec uses it (the "info icon", and the absent card text
 *   in the third test) is inside the `<aside>`, so the shared narrower helper
 *   resolves the same elements. Not widened.
 * - ABSENCE (three sites, all `should("not.exist")`) → retrying
 *   `toHaveCount(0)`, the faithful equivalent. Each is anchored on a positive
 *   signal that upstream also requires, and each was proven non-vacuous by
 *   inverting its input — see findings.
 * - The two `within()` blocks rooted at `embedModalEnableEmbeddingCard()` need
 *   the card to EXIST — `cy.findByTestId` throws when it does not, and
 *   `.within()` on a missing subject is a Cypress error. That implicit
 *   existence requirement is ported explicitly as a `toBeVisible()` anchor, so
 *   an absence check inside the card cannot pass on a card that never
 *   rendered.
 */

const GUEST_CARD_TEXT =
  "To continue, enable guest embeds and agree to the usage conditions.";

const FAIR_USAGE_TOOLTIP =
  /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/;

const USAGE_CONDITIONS_HREF = "https://metabase.com/license/embedding";

/**
 * Port of
 * `cy.findAllByTestId("guest-embeds-setting-card").first().within(() => cy.findByText("New embed").click())`.
 */
async function openNewEmbedFromGuestCard(page: Page) {
  await page
    .getByTestId("guest-embeds-setting-card")
    .first()
    .getByText("New embed", { exact: true })
    .click();
}

function infoIcon(scope: ReturnType<typeof getEmbedSidebar>) {
  return scope.getByLabel("info icon", { exact: true });
}

/** Port of `cy.findByRole("link", { name: "usage conditions" })` plus its two
 * attribute assertions. */
async function expectUsageConditionsLink(
  scope: ReturnType<typeof getEmbedSidebar>,
) {
  const link = scope.getByRole("link", {
    name: "usage conditions",
    exact: true,
  });

  await expect(link).toHaveAttribute("href", USAGE_CONDITIONS_HREF);
  await expect(link).toHaveAttribute("target", "_blank");
}

for (const [tierName, token] of [
  ["OSS", null],
  ["Starter", "starter"],
] as const) {
  test.describe(`scenarios > embedding > sdk iframe embed setup > enable embed js (${tierName})`, () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      if (token) {
        await mb.api.activateToken(token);
      }

      // The tier precondition, asserted rather than assumed. `activateToken`
      // PUTs with `failOnStatusCode: false`, so "it didn't throw" proves
      // nothing either way.
      const properties = (await (
        await mb.api.get("/api/session/properties")
      ).json()) as { "token-features"?: Record<string, unknown> };
      const enabled = Object.entries(properties["token-features"] ?? {})
        .filter(([, value]) => value === true)
        .map(([name]) => name);

      if (token === null) {
        expect(enabled, "no token features active (@OSS)").toEqual([]);
      } else {
        expect(enabled.length, `${tierName} token took`).toBeGreaterThan(0);
      }
      // The feature the last test depends on being ABSENT, in both tiers.
      expect(enabled, "embedding_simple must be absent").not.toContain(
        "embedding_simple",
      );
    });

    test.describe("guest", () => {
      test("shows the Enable to Continue button and enables embedding on click", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting("enable-embedding-static", false);
        await mb.api.updateSetting("show-static-embed-terms", true);

        await page.goto("/admin/embedding");

        await openNewEmbedFromGuestCard(page);

        await expect(embedModalEnableEmbeddingCard(page)).toContainText(
          GUEST_CARD_TEXT,
        );

        // usage conditions should be a link
        await expectUsageConditionsLink(embedModalEnableEmbeddingCard(page));

        // shows tooltip with fair usage info
        await infoIcon(embedModalEnableEmbeddingCard(page)).dispatchEvent(
          "mouseover",
        );

        await expect(
          hovercard(page).getByText(FAIR_USAGE_TOOLTIP),
        ).toBeVisible();

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
        await mb.api.updateSetting("enable-embedding-static", true);
        await mb.api.updateSetting("show-static-embed-terms", true);

        await page.goto("/admin/embedding");

        await openNewEmbedFromGuestCard(page);

        // Upstream splits this across two `contain.text` assertions because
        // the "usage conditions" link sits between the two fragments.
        await expect(embedModalEnableEmbeddingCard(page)).toContainText(
          "Agree to the",
        );
        await expect(embedModalEnableEmbeddingCard(page)).toContainText(
          "to continue.",
        );

        await expectUsageConditionsLink(embedModalEnableEmbeddingCard(page));

        // The two assertions above are the positive anchor for this absence
        // check: the card has rendered its "already enabled" copy, so "the
        // not-yet-enabled copy is absent" is a real observation.
        await expect(
          embedModalEnableEmbeddingCard(page).getByText(
            /To continue, enable guest embeds and agree to the/,
          ),
        ).toHaveCount(0);

        // shows tooltip with fair usage info
        await infoIcon(getEmbedSidebar(page)).dispatchEvent("mouseover");

        await expect(
          hovercard(page).getByText(FAIR_USAGE_TOOLTIP),
        ).toBeVisible();
      });

      test("hides the enable card when embedding is already enabled", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting("enable-embedding-static", true);
        await mb.api.updateSetting("show-static-embed-terms", false);

        await page.goto("/admin/embedding");

        await openNewEmbedFromGuestCard(page);

        // Upstream's `getEmbedSidebar()` is `findByRole("complementary")`,
        // which throws when absent — that implicit existence assertion is the
        // anchor, and porting it explicitly keeps the absence check below from
        // passing on a page that never rendered.
        await expect(getEmbedSidebar(page)).toBeVisible();

        await expect(
          getEmbedSidebar(page).getByText(GUEST_CARD_TEXT, { exact: false }),
        ).toHaveCount(0);
      });
    });

    test.describe("Metabase account (sso)", () => {
      test("does not show the Enable to Continue button and disables item", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting("enable-embedding-simple", false);
        await mb.api.updateSetting("show-simple-embed-terms", true);

        await page.goto("/admin/embedding");

        await openNewEmbedFromGuestCard(page);

        // Existence anchor for the `within()` block — see header.
        await expect(embedModalEnableEmbeddingCard(page)).toBeVisible();

        await expect(
          embedModalEnableEmbeddingCard(page).getByText(GUEST_CARD_TEXT, {
            exact: true,
          }),
        ).toHaveCount(0);

        await expect(
          page.getByLabel("Metabase account (SSO)", { exact: true }),
        ).toBeDisabled();
      });
    });
  });
}
