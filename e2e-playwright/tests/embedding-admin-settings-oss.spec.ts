import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { icon, main } from "../support/ui";

/**
 * Port of e2e/test/scenarios/embedding/embedding-admin-settings-oss.cy.spec.ts
 *
 * TIER — read this before assuming the `@OSS` tag means "skip on an EE jar".
 * Upstream tags the describe `@OSS` and activates NO token. `mb.restore()`
 * wipes `premium-embedding-token`, and the beforeEach probe below proves the
 * result: on this jar, no token → zero enabled `token-features`. So the
 * token-feature half of "OSS" is genuinely reproduced and nothing is
 * `test.skip`ped — all 3 tests execute.
 *
 * The half that is NOT reproduced is the BUILD. Per PORTING.md/FINDINGS #49,
 * an EE jar with no token is not an OSS build: `PLUGIN_IS_EE_BUILD` is still
 * true, so EE-only chrome renders regardless of licensing. Two consequences,
 * both MEASURED on this jar rather than assumed:
 *
 * 1. The sidebar ABSENCE assertions ("Setup guide", "Guest embeds") are safe.
 *    They are token-gated, not build-gated: with no token and with `starter`
 *    both links are absent, and with `pro-self-hosted` both appear
 *    (count 1 each). So the checks are non-vacuous by inversion and draw
 *    exactly the distinction upstream intends.
 *
 * 2. The upsell URL assertion is NOT portable — see the `test.fixme` below.
 *
 * The `dev_instances` upsell ("Get a development instance") renders on this
 * jar as a second `.Icon-gem` inside `admin-layout-content`; on an OSS build
 * upstream only ever sees the embedding upsell's gem. That does not change the
 * outcome of the gem assertion (see rule 3 below), but it is the visible
 * fingerprint of the EE build and worth knowing about.
 *
 * Port notes:
 * - `cy.url().should("include", …)` → `expect(page).toHaveURL(/…/)`, which
 *   also retries.
 * - `cy.findByRole("link", { name: /Setup guide/ })` uses a REGEX name, i.e. a
 *   substring match, so `{ exact: false }` is not enough — the regex is passed
 *   through as-is.
 * - ABSENCE (`should("not.exist")`) → retrying `toHaveCount(0)`, the faithful
 *   equivalent. Anchored on the positive `Security` link assertion that
 *   upstream itself makes three lines later inside the same sidebar: if the
 *   sidebar had not rendered, that anchor fails too.
 * - `cy.icon("gem").should("be.visible")` resolves to TWO gems here (the
 *   embedding upsell and the EE-build `dev_instances` upsell). Upstream is an
 *   ANY-of-set assertion (rule 3): chai-jquery's `visible` is
 *   `$el.is(":visible")`, and jQuery's `.is()` is true when at least one
 *   element matches. So `.filter({ visible: true }).first()` is the faithful
 *   port, not a defensive `.first()`.
 * - `cy.findByText("Cross-Origin Resource Sharing (CORS)")` is an EXACT match
 *   (rule 1), and upstream asserts `should("exist")` — not visibility — so it
 *   is ported as `toHaveCount(1)` rather than `toBeVisible()`. Same for the
 *   `Security` link.
 */

const UPGRADE_URL =
  "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embedding-page&source_plan=oss&utm_users=10&utm_campaign=embedding-methods";

function adminSidebar(page: Page) {
  return page.getByTestId("admin-layout-sidebar");
}

function adminContent(page: Page) {
  return page.getByTestId("admin-layout-content");
}

test.describe("scenarios > embedding > admin settings > oss", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The tier precondition, asserted rather than assumed: "we did not call
    // activateToken" is not evidence that no features are active.
    const properties = (await (
      await mb.api.get("/api/session/properties")
    ).json()) as { "token-features"?: Record<string, unknown> };
    const enabled = Object.entries(properties["token-features"] ?? {})
      .filter(([, value]) => value === true)
      .map(([name]) => name);
    expect(enabled, "no token features active (@OSS)").toEqual([]);

    await mb.api.updateSetting("show-sdk-embed-terms", false);
  });

  test("shows all embedding types without the setup guide", async ({
    page,
  }) => {
    // Navigate to Embedding admin section
    await page.goto("/admin/embedding");

    // Check that we're on the embedding settings page
    await expect(page).toHaveURL(/\/admin\/embedding/);
    await expect(main(page).getByText("Embedding settings")).toBeVisible();

    // Verify sidebar contains security settings link. Upstream asserts this
    // LAST; it is hoisted here to serve as the positive anchor for the two
    // absence checks below — same assertion, same subject, no weakening.
    await expect(
      adminSidebar(page).getByRole("link", { name: /Security/ }),
    ).toHaveCount(1);

    // Verify sidebar does not contain setup guide
    await expect(
      adminSidebar(page).getByRole("link", { name: /Setup guide/ }),
    ).toHaveCount(0);

    // Verify sidebar does not contain guest embeds link
    await expect(
      adminSidebar(page).getByRole("link", { name: /Guest embeds/ }),
    ).toHaveCount(0);
  });

  /**
   * GATE-SKIPPED: this test asserts OSS-BUILD-only rendering and cannot run on
   * the EE uberjar. No token manipulation reproduces it — the branch is chosen
   * by plugin registration, not by token features.
   *
   * `SharedCombinedEmbeddingSettings` renders `<UpsellBanner buttonText="Upgrade"
   * buttonLink={upgradeUrl} onClick={triggerUpsellFlow}>`, and `UpsellCta`
   * (frontend/src/metabase/common/components/upsells/components/UpsellCta.tsx)
   * matches on `onClick` BEFORE `url`:
   *
   *   - OSS build: `PLUGIN_ADMIN_SETTINGS.useUpsellFlow` is the default stub in
   *     `frontend/src/metabase/plugins/oss/settings.ts`, which returns
   *     `{ triggerUpsellFlow: undefined }` → the `url` branch wins →
   *     `<ExternalLink href={upgradeUrl}>Upgrade</ExternalLink>`. Upstream's
   *     `findByRole("link", { name: "Upgrade" }).should("have.attr","href",…)`
   *     passes.
   *   - EE build (this jar): `metabase-enterprise/license/index.ts` assigns the
   *     real `useUpsellFlow`, so `onClick` is non-null → the FIRST branch wins →
   *     `<UnstyledButton>Upgrade</UnstyledButton>`, with NO href at all.
   *
   * Measured on the jar: `role=link name="Upgrade"` count 0,
   * `role=button name="Upgrade"` count 1, `tagName=BUTTON`, `href=null` — at
   * every tier (no token, starter, pro-self-hosted).
   *
   * Not ported as a weakened test: dropping the href assertion would leave a
   * green test that no longer checks the upsell URL, which is the only thing
   * this test is really about. Left `fixme` so an OSS-build CI lane can enable
   * it unchanged.
   */
  test.fixme("should show embedding upsell on oss", async ({ page }) => {
    await page.goto("/admin/embedding/interactive");

    await expect(
      adminContent(page).getByRole("heading", { name: "Embedding settings" }),
    ).toBeVisible();

    // upsell gem icon should be visible (rule 3 — see header)
    await expect(
      icon(adminContent(page), "gem").filter({ visible: true }).first(),
    ).toBeVisible();

    await expect(
      adminContent(page).getByRole("link", { name: "Upgrade", exact: true }),
    ).toHaveAttribute("href", UPGRADE_URL);
  });

  test("should show CORS setting on security page", async ({ page }) => {
    await page.goto("/admin/embedding/security");

    await expect(
      adminContent(page).getByText("Cross-Origin Resource Sharing (CORS)", {
        exact: true,
      }),
    ).toHaveCount(1);
  });
});
