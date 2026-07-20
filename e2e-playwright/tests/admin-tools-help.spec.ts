/**
 * Playwright port of e2e/test/scenarios/admin/tools/help.cy.spec.ts
 *
 * Admin > Troubleshooting > Help: the "Get help" link (free vs premium URL,
 * with diagnostic payload), and the cloud-only "Helping hand" support-access
 * grant flow.
 *
 * Porting notes:
 * - The first describe is upstream-tagged @OSS. That tag means "runs on both
 *   OSS and EE, both without a token" (see embedding-smoketests). Its only
 *   assertion is the free-plan (`/help`, no `diag`) link, which is driven by
 *   `getIsPaidPlan` (token-status), NOT by the OSS-vs-EE build — so it is
 *   identical on the EE spike backend without a token. Ported to run
 *   unconditionally rather than skipped.
 * - `.should("have.prop", "href")` reads the resolved DOM property; the links
 *   are absolute `https://…` URLs, so `getAttribute("href")` is equivalent.
 * - `cy.findByText("Get help")` resolves the `<h3>` inside the link's `<a>`;
 *   ported via the anchor that `has` the "Get help" heading, scoped to
 *   admin-layout-content (upstream scopes the EE case there — a second
 *   "Get help" can exist in the app help menu).
 * - The EE and helping-hand describes are token-gated (jar activates the token);
 *   `test.skip(!resolveToken(...))` mirrors the token requirement.
 * - `mockSessionPropertiesTokenFeatures` merges `support-users` into
 *   token-features. It is INERT for the "Helping hand" section's visibility:
 *   `metabase-enterprise/support/index.ts` sets `PLUGIN_SUPPORT.isEnabled` at
 *   module-init time from `hasPremiumFeature("support-users")`, which reads
 *   `window.MetabaseBootstrap` — the JSON the backend inlines into index.html
 *   (`frontend/src/metabase/utils/settings.ts` seeds MetabaseSettings from it
 *   before any XHR). A `/api/session/properties` intercept cannot reach that.
 *   Ported faithfully anyway, so the upstream shape is preserved — but nothing
 *   here should ever be "fixed" by editing that mock.
 * - Consequently the section's visibility is a pure function of ONE input:
 *   whether the active token grants `support-users` in the bootstrap. Which
 *   PLANS grant it is store-side data that lives outside this repo and does
 *   drift (see the cloud-customers test below), so that test asserts the
 *   relationship against the observed grant rather than hardcoding a
 *   plan→feature table.
 */
import dayjs from "dayjs";

import { resolveToken } from "../support/api";
import {
  executeCreateGrantAccessFlow,
  mockSessionPropertiesTokenFeatures,
} from "../support/admin-tools-help";
import { test, expect } from "../support/fixtures";
import { icon, modal } from "../support/ui";
import { undoToast } from "../support/metrics";

const OSS_HELP_LINK_REGEX =
  /^https:\/\/www\.metabase\.com\/help\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v(?:(?!diag=).)+$/;

const PREMIUM_HELP_LINK_REGEX =
  /^https:\/\/www\.metabase\.com\/help-premium\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v.+&diag=%7B.+%7D$/;

/** The "Get help" link anchor inside the help page content. */
function getHelpLink(page: import("@playwright/test").Page) {
  return page
    .getByTestId("admin-layout-content")
    .locator("a")
    .filter({
      has: page.getByRole("heading", { name: "Get help", exact: true }),
    });
}

function helpingHandHeading(page: import("@playwright/test").Page) {
  return page.getByRole("heading", { name: "Helping hand", exact: true });
}

/**
 * The single input the "Helping hand" section's visibility is computed from:
 * `window.MetabaseBootstrap["token-features"]["support-users"]`, read at
 * plugin-init time from the JSON the backend inlines into index.html. Read it
 * from the page (not from `/api/session/properties`) so we sample exactly the
 * value the app used for THIS document — and so the session-properties route
 * mock, which is inert here, cannot skew it.
 */
async function bootstrapGrantsSupportUsers(
  page: import("@playwright/test").Page,
) {
  return await page.evaluate(
    () =>
      (window as unknown as Record<string, any>).MetabaseBootstrap?.[
        "token-features"
      ]?.["support-users"] === true,
  );
}

test.describe("scenarios > admin > tools > help", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should link `Get help` to help", async ({ page }) => {
    await page.goto("/admin/tools/help");

    await expect(page.getByText("Metabase Admin").first()).toBeVisible();

    await expect(getHelpLink(page)).toHaveAttribute(
      "href",
      OSS_HELP_LINK_REGEX,
    );
  });
});

test.describe("scenarios > admin > tools > help (EE)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should link `Get Help` to help-premium", async ({ page }) => {
    await page.goto("/admin/tools/help");

    await expect(getHelpLink(page)).toHaveAttribute(
      "href",
      PREMIUM_HELP_LINK_REGEX,
    );
  });
});

test.describe("scenarios > admin > tools > help > helping hand", () => {
  test.skip(
    !resolveToken("pro-cloud") ||
      !resolveToken("starter") ||
      !resolveToken("pro-self-hosted"),
    "requires the pro-cloud / starter / pro-self-hosted tokens",
  );

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mockSessionPropertiesTokenFeatures(page, { "support-users": true });
  });

  test("should display the `Helping hand` section exactly when the active token grants support-users", async ({
    page,
    mb,
  }) => {
    // No token at all (the restored snapshot): grants nothing, so the section
    // must be absent. This is the test's hard negative case — it does not
    // depend on any plan's feature list.
    await page.goto("/admin/tools/help");
    expect(await bootstrapGrantsSupportUsers(page)).toBe(false);
    await expect(helpingHandHeading(page)).toHaveCount(0);

    // Then each paid plan. Upstream hardcoded "pro-self-hosted hides it,
    // starter/pro-cloud show it", which asserts the STORE's plan→feature
    // mapping, not Metabase's behaviour — and that mapping changed: the
    // staging pro-self-hosted token now grants `support-users`, which is what
    // reddened CI (run 29711801159). Assert the app's actual contract instead:
    // the section renders iff the bootstrap grants the feature.
    for (const plan of ["pro-self-hosted", "starter", "pro-cloud"] as const) {
      await mb.api.activateToken(plan);
      await page.reload();

      const granted = await bootstrapGrantsSupportUsers(page);
      if (granted) {
        await expect(
          helpingHandHeading(page),
          `${plan} grants support-users, so the section must render`,
        ).toBeVisible();
      } else {
        await expect(
          helpingHandHeading(page),
          `${plan} does not grant support-users, so the section must not render`,
        ).toHaveCount(0);
      }
    }
  });

  test("should allow creating a new access grant", async ({ page, mb }) => {
    await mb.api.activateToken("pro-cloud");
    await page.goto("/admin/tools/help");

    await expect(page.getByTestId("access-grant-list-table")).toHaveCount(0);

    await executeCreateGrantAccessFlow(page);

    await expect(page.getByTestId("access-grant-list-table")).toBeVisible();
    await expect(
      page.getByTestId("access-grant-list-table").locator("tbody").getByRole("row"),
    ).toHaveCount(1);
  });

  test("allow creating an access grant with a ticket number and custom notes", async ({
    page,
    mb,
  }) => {
    await mb.api.activateToken("pro-cloud");
    await page.goto("/admin/tools/help");

    await executeCreateGrantAccessFlow(page, {
      durationOption: "48 hours",
      ticket: "TICKET-999",
      notes: "Custom notes",
    });

    const table = page.getByTestId("access-grant-list-table");
    await expect(
      table.getByRole("cell", {
        name: new RegExp(dayjs().format("MMM D, YYYY")),
      }),
    ).toBeVisible();
    await expect(
      table.getByRole("cell", { name: /TICKET-999/ }),
    ).toBeVisible();
    await expect(
      table.getByRole("cell", { name: /Custom notes/ }),
    ).toBeVisible();
    await expect(table.getByText(/48 hours left/)).toBeVisible();
  });

  test("should disallow more than one active access grant", async ({
    page,
    mb,
  }) => {
    await mb.api.activateToken("pro-cloud");
    await page.goto("/admin/tools/help");

    await executeCreateGrantAccessFlow(page);

    await expect(
      page.getByRole("button", {
        name: "Request a helping hand",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByText("You can only have one active request at a time", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can revoke an access grant", async ({ page, mb }) => {
    await mb.api.activateToken("pro-cloud");
    await page.goto("/admin/tools/help");

    await executeCreateGrantAccessFlow(page);
    await expect(
      page.getByRole("button", {
        name: "Request a helping hand",
        exact: true,
      }),
    ).toBeDisabled();

    // Dismiss the create-success toast.
    await icon(undoToast(page).first(), "close").click();

    await page
      .getByTestId("access-grant-list-table")
      .getByRole("button", { name: "Revoke access grant", exact: true })
      .click();
    await expect(
      modal(page).getByRole("heading", {
        name: "Revoke access grant?",
        exact: true,
      }),
    ).toBeVisible();
    await modal(page).getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(
      undoToast(page)
        .filter({ hasText: "Access grant revoked successfully" })
        .first(),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Request a helping hand",
        exact: true,
      }),
    ).toBeEnabled();
  });
});
