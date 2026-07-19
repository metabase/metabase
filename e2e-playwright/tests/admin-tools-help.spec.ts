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
 *   token-features. The "Helping hand" section's visibility is actually driven
 *   by whether the ACTIVE token grants support-users (cloud tokens do,
 *   pro-self-hosted does not) — the plugin reads the bootstrap settings, which
 *   neither harness's session-properties intercept reaches — so the mock is
 *   ported faithfully but does not itself force the section visible.
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

  test("should only display the `Helping hand` section for cloud customers", async ({
    page,
    mb,
  }) => {
    await page.goto("/admin/tools/help");
    await expect(
      page.getByRole("heading", { name: "Helping hand", exact: true }),
    ).toHaveCount(0);

    await mb.api.activateToken("pro-self-hosted");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Helping hand", exact: true }),
    ).toHaveCount(0);

    await mb.api.activateToken("starter");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Helping hand", exact: true }),
    ).toBeVisible();

    await mb.api.activateToken("pro-cloud");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Helping hand", exact: true }),
    ).toBeVisible();
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
