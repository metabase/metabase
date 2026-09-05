/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-theme-editor/theme-upsell.cy.spec.ts —
 * the /admin/embedding/themes upsell: what OSS and Starter admins see instead
 * of the theme listing, and that a Pro admin sees the listing with no upsell.
 *
 * Porting notes:
 * - The upsell is gated in BOTH directions, so the gating differs per describe:
 *   - "OSS" runs token-free. It is genuinely build-agnostic on this EE jar:
 *     with no token every token-feature is false, so `getPlan()` returns "oss"
 *     (frontend/src/metabase/common/utils/plan.ts) and `is-hosted?` is false —
 *     which is exactly what the `source_plan=oss` + external-link assertions
 *     require. So no `isOssBackend` skip: this describe really executes.
 *   - "Starter" needs MB_STARTER_CLOUD_TOKEN, "Pro" needs
 *     MB_PRO_SELF_HOSTED_TOKEN → `test.skip(!resolveToken(...))` per describe.
 * - findByText / findByRole with string args are exact (rule 1); the
 *   /Themes/ and /New theme/ role names stay regexes (upstream used regexes).
 * - `cy.intercept(...)` here are pure stubs that are never awaited by name, so
 *   they become `page.route` handlers registered before `page.goto` (rule 2).
 *   The GET /api/session/properties patch uses native `fetch` rather than
 *   `route.fetch()` — the bun set-cookie workaround already used by
 *   `mockSessionPropertiesTokenFeatures`.
 * - `cy.icon("gem").should("be.visible")` is an ANY-match (rule 3 / the
 *   documented `.Icon-refresh` case) → `.filter({ visible: true }).first()`.
 * - `should("have.attr", "href").and("include", …)` → read the attribute once
 *   and assert both substrings on it.
 *
 * Deliberate strengthening (recorded in findings-inbox/theme-upsell.md):
 *   three of upstream's `should("not.exist")` checks fire before anything
 *   guarantees the page has finished rendering, so they can pass vacuously
 *   against a still-loading page. They are ported as real assertions by
 *   ordering the positive, render-gating assertion first:
 *   - "Pro": assert the Themes listing heading + New-theme button first, then
 *     assert the upsell copy is absent (the listing renders a `<Loader/>`
 *     while `useListEmbeddingThemesQuery` is in flight, during which the
 *     upsell copy is trivially absent).
 *   - "Starter / store admin": await the trial-availability response before
 *     asserting the contact-admin fallback and the 14-day-trial line are
 *     absent — both are rendered from state that only exists after that
 *     response lands.
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  CLOUD_TRIAL_PATH,
  gemIcons,
  mockCurrentAdminAsStoreUser,
  mockTrialAvailability,
  themesNavLink,
  visibleGemIcon,
} from "../support/theme-upsell";
import { main } from "../support/ui";

const UPSELL_DESCRIPTION =
  "Fine-tune the appearance of your embedded content with colors and fonts.";

test.describe("scenarios > embedding > themes > upsell", () => {
  test.describe("OSS", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("shows the upsell with Metabase Pro copy and an external upgrade link", async ({
      page,
    }) => {
      await page.goto("/admin/embedding/themes");

      // nav label has an upsell gem
      await expect(visibleGemIcon(themesNavLink(page))).toBeVisible();

      const content = main(page);

      // upsell copy matches the Figma
      await expect(
        content.getByText("Metabase Pro", { exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("heading", {
          name: "Create custom themes",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        content.getByText(UPSELL_DESCRIPTION, { exact: true }),
      ).toBeVisible();

      // CTA is an external upgrade link for non-hosted instances
      const upgradeLink = content.getByRole("link", {
        name: "Upgrade to Pro",
        exact: true,
      });
      await expect(upgradeLink).toBeVisible();
      const href = await upgradeLink.getAttribute("href");
      expect(href).toContain("utm_campaign=embedding-themes");
      expect(href).toContain("source_plan=oss");

      // theme listing controls are not rendered
      await expect(
        content.getByRole("button", { name: /New theme/ }),
      ).toHaveCount(0);
    });
  });

  test.describe("Starter", () => {
    test.skip(
      !resolveToken("starter"),
      "Requires MB_STARTER_CLOUD_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("starter");
    });

    test("shows the Upgrade to Pro CTA when the current admin is not a Metabase Store Admin", async ({
      page,
    }) => {
      // keep the trial check deterministic — no trial, so CTA stays "Upgrade to Pro"
      await mockTrialAvailability(page, { available: false });

      await page.goto("/admin/embedding/themes");

      // nav label has an upsell gem
      await expect(visibleGemIcon(themesNavLink(page))).toBeVisible();

      const content = main(page);

      await expect(
        content.getByText("Metabase Pro", { exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("heading", {
          name: "Create custom themes",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        content.getByText(UPSELL_DESCRIPTION, { exact: true }),
      ).toBeVisible();

      // hosted starter admins can upgrade even when they are not Store Admins
      await expect(
        content.getByRole("button", { name: "Upgrade to Pro", exact: true }),
      ).toBeVisible();
    });

    test("shows the Upgrade to Pro CTA when the current admin is a Metabase Store Admin", async ({
      page,
    }) => {
      // inject the current admin into token-status.store-users so isStoreUser becomes true
      await mockCurrentAdminAsStoreUser(page);

      // keep the trial check deterministic — no trial, so CTA stays "Upgrade to Pro"
      await mockTrialAvailability(page, { available: false });

      const trialChecked = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === CLOUD_TRIAL_PATH &&
          response.request().method() === "POST",
      );

      await page.goto("/admin/embedding/themes");

      const content = main(page);

      await expect(
        content.getByText("Metabase Pro", { exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("heading", {
          name: "Create custom themes",
          exact: true,
        }),
      ).toBeVisible();

      // the trial-availability response is what decides both absences below,
      // so wait for it rather than asserting into an unresolved query
      await trialChecked;

      // CTA is rendered (hosted starter as store admin → opens the upgrade modal)
      await expect(
        content.getByRole("button", { name: "Upgrade to Pro", exact: true }),
      ).toBeVisible();

      // contact-admin fallback is not rendered
      await expect(
        content.getByText(/Please ask a Metabase Store Admin/),
      ).toHaveCount(0);

      // no trial → no trial line
      await expect(content.getByText(/14-day free trial/)).toHaveCount(0);
    });

    test("shows the Try for free CTA and trial copy when a trial is available", async ({
      page,
    }) => {
      // admin is a Store Admin, so the CTA branch is taken
      await mockCurrentAdminAsStoreUser(page);

      // trial is available → CTA switches to "Try for free" and trial line appears
      await mockTrialAvailability(page, { available: true });

      await page.goto("/admin/embedding/themes");

      const content = main(page);

      await expect(
        content.getByText("Metabase Pro", { exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("heading", {
          name: "Create custom themes",
          exact: true,
        }),
      ).toBeVisible();

      // trial line is rendered
      await expect(
        content.getByText(
          /Get a 14-day free trial of this and other pro features/,
        ),
      ).toBeVisible();

      // button text switches to "Try for free"
      await expect(
        content.getByRole("button", { name: "Try for free", exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("button", { name: "Upgrade to Pro", exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("Pro", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("does not show the upsell and renders the themes listing", async ({
      page,
    }) => {
      await page.goto("/admin/embedding/themes");

      const content = main(page);

      // theme listing is rendered (asserted first: while
      // useListEmbeddingThemesQuery is loading the listing renders a Loader,
      // during which the upsell-absence checks below would be vacuous)
      await expect(
        content.getByRole("heading", { name: "Themes", exact: true }),
      ).toBeVisible();
      await expect(
        content.getByRole("button", { name: /New theme/ }),
      ).toBeVisible();

      // nav label has no upsell gem
      await expect(gemIcons(themesNavLink(page))).toHaveCount(0);

      // upsell copy is absent
      await expect(
        content.getByText("Metabase Pro", { exact: true }),
      ).toHaveCount(0);
      await expect(
        content.getByRole("heading", {
          name: "Create custom themes",
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });
});
