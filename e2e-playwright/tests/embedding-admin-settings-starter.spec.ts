import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { icon, main } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/embedding-admin-settings-starter.cy.spec.ts
 *
 * This is the `starter` twin of `tests/embedding-admin-settings-oss.spec.ts`.
 * The two upstream files are near-identical by design; the duplication is the
 * faithful state and is kept, not factored into a shared loop, because they
 * are two separate upstream specs with two separate tier setups.
 *
 * TIER. Upstream carries no tag and activates `starter`. The gate is REAL for
 * the assertions that matter and was measured, not assumed:
 *
 *   | tier            | Setup guide link | Guest embeds link |
 *   | --------------- | ---------------- | ----------------- |
 *   | no token        | absent           | absent            |
 *   | starter         | absent           | absent            |
 *   | pro-self-hosted | present (1)      | present (1)       |
 *
 * So the first test's two absence checks are token-gated and non-vacuous by
 * inversion — `starter` genuinely lacks whatever feature mounts those links,
 * exactly as upstream intends. Nothing is `test.skip`ped; all 3 tests execute.
 * The `starter` token is asserted to have taken in the beforeEach rather than
 * trusted, since `activateToken` PUTs with `failOnStatusCode: false`.
 *
 * WHY THIS FILE HAS NO `fixme` AND ITS OSS TWIN DOES. The OSS spec's upsell
 * test additionally asserts the "Upgrade" CTA's `href`, which on an EE build
 * renders as a `<button>` rather than an `<a>` (see that file's header for the
 * `UpsellCta` branch analysis). This file's upsell test asserts only the
 * heading and the gem icon, neither of which is build-dependent, so it ports
 * and runs cleanly.
 *
 * Port notes:
 * - `cy.url().should("include", …)` → `expect(page).toHaveURL(/…/)`.
 * - `cy.findByRole("link", { name: /Setup guide/ })` uses a REGEX name (a
 *   substring match); the regex is passed through as-is.
 * - ABSENCE (`should("not.exist")`) → retrying `toHaveCount(0)`, the faithful
 *   equivalent, anchored on the positive `Security` link assertion upstream
 *   itself makes inside the same sidebar.
 * - `cy.icon("gem").should("be.visible")` resolves to TWO gems on this jar (the
 *   embedding upsell and the EE-build `dev_instances` upsell). Upstream is an
 *   ANY-of-set assertion (rule 3): chai-jquery's `visible` is
 *   `$el.is(":visible")` and jQuery's `.is()` is true when at least one element
 *   matches, so `.filter({ visible: true }).first()` is the faithful port, not
 *   a defensive `.first()`.
 * - `cy.findByText("Cross-Origin Resource Sharing (CORS)")` is an EXACT match
 *   (rule 1), and upstream asserts `should("exist")` — not visibility — so it
 *   is ported as `toHaveCount(1)`. Same for the `Security` link.
 */

function adminSidebar(page: Page) {
  return page.getByTestId("admin-layout-sidebar");
}

function adminContent(page: Page) {
  return page.getByTestId("admin-layout-content");
}

test.describe("scenarios > embedding > admin settings > starter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.activateToken("starter");

    // Asserted, not assumed: `activateToken` does not throw on failure.
    const properties = (await (
      await mb.api.get("/api/session/properties")
    ).json()) as { "token-features"?: Record<string, unknown> };
    const enabled = Object.entries(properties["token-features"] ?? {})
      .filter(([, value]) => value === true)
      .map(([name]) => name);
    expect(enabled.length, "starter token took").toBeGreaterThan(0);

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
    // LAST; hoisted here to anchor the two absence checks below — same
    // assertion, same subject, no weakening.
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

  // Upstream's title says "on oss"; kept verbatim (it is the starter file's
  // copy-paste of the OSS one). Renaming would break title-based test
  // selection parity with upstream.
  test("should show embedding upsell on oss", async ({ page }) => {
    await page.goto("/admin/embedding/interactive");

    await expect(
      adminContent(page).getByRole("heading", { name: "Embedding settings" }),
    ).toBeVisible();

    // upsell gem icon should be visible (rule 3 — see header)
    await expect(
      icon(adminContent(page), "gem").filter({ visible: true }).first(),
    ).toBeVisible();
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
