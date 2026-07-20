/**
 * Playwright port of
 * e2e/test/scenarios/permissions/application-permissions.cy.spec.js
 *
 * The three EE "application permissions" (Settings / Monitoring /
 * Subscriptions) granted to the All Users group, and what each one unlocks or
 * locks away for a non-admin. Gated on the EE `pro-self-hosted` token (the CI
 * jar activates it).
 *
 * Port notes:
 * - `modifyPermission` (full upstream signature) and `saveChangesToPermissions`
 *   are reused read-only from support/admin-permissions.ts and
 *   support/command-palette.ts. The spec inlines the body of
 *   H.saveChangesToPermissions verbatim (edit-bar Save → "Save permissions?"
 *   modal → Yes), so the shared port is the faithful stand-in and also adds the
 *   PUT wait upstream's helper has.
 * - `cy.findByText(string)` / `findByLabelText(string)` are EXACT
 *   testing-library matches → `{ exact: true }` (rule 1).
 * - `should("not.exist")` is a ONE-SHOT absence check in Cypress, not a
 *   retrying one. Each is ported as a non-retrying `count()` taken at a defined
 *   instant, after gating on the container that must be present — matching the
 *   original's strength rather than silently strengthening it.
 * - Bare `cy.findByText(...)` / `cy.findAllByText(...)` with no `.should` ARE
 *   assertions (testing-library throws when nothing matches), so they port as
 *   real visibility assertions, not as no-ops.
 * - `H.setupSMTP()` PUTs /api/email, which live-validates the connection and
 *   therefore needs the maildev container. This spec only needs the
 *   "email is configured" state (it never reads an inbox), so the port uses
 *   `configureSmtpSettings`, which writes the same settings through the bulk
 *   settings endpoint and skips validation. Keeps the test executable on the
 *   bare jar instead of gate-skipped.
 * - `cy.location("pathname").should("eq", …)` / `cy.url().should("include", …)`
 *   were retried by Cypress → `expect.poll` (wave-5 gotcha).
 */
import { configureSmtpSettings } from "../support/admin-extras";
import { modifyPermission } from "../support/admin-permissions";
import { createErroringQuestion } from "../support/admin-tools";
import { resolveToken } from "../support/api";
import {
  MONITORING_INDEX,
  SETTINGS_INDEX,
  SUBSCRIPTIONS_INDEX,
  createSubscription,
  notificationsList,
} from "../support/application-permissions";
import {
  getProfileLink,
  goToAdmin,
  saveChangesToPermissions,
} from "../support/command-palette";
import { adminAppLinkText } from "../support/custom-viz";
import { sidebar } from "../support/download-permissions";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { tableInteractive } from "../support/models";
import { openDashboardMenu } from "../support/organization";
import { ORDERS_DASHBOARD_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  openSharingMenu,
  sharingMenu,
  sharingMenuButton,
} from "../support/sharing";
import { icon, main, modal, popover, visitDashboard, visitQuestion } from "../support/ui";

const NORMAL_USER_ID = 2;

test.describe("scenarios > admin > permissions > application", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("shows permissions help", async ({ page }) => {
    await page.goto("/admin/permissions/application");

    const permissionHelpButton = main(page).getByText("Permissions help", {
      exact: true,
    });
    await permissionHelpButton.click();
    // Upstream's `should("not.exist")` fires once; the button is replaced by
    // the reference panel synchronously on click.
    expect(await permissionHelpButton.count()).toBe(0);

    const helpReference = page.getByLabel("Permissions help reference", {
      exact: true,
    });
    // `findAllByText` throws when nothing matches → an existence assertion.
    await expect(
      helpReference.getByText("Applications permissions", { exact: true }).first(),
    ).toBeVisible();

    await expect(
      helpReference.getByText(
        "Application settings are useful for granting groups access to some, but not all, of Metabase’s administrative features.",
        { exact: true },
      ),
    ).toBeVisible();

    await helpReference.getByLabel("Close", { exact: true }).click();
  });

  test.describe("subscriptions permission", () => {
    test.describe("revoked", () => {
      test.beforeEach(async ({ page, mb }) => {
        await page.goto("/admin/permissions/application");

        await modifyPermission(page, "All Users", SUBSCRIPTIONS_INDEX, "No");

        await saveChangesToPermissions(page);

        await createSubscription(mb.api, NORMAL_USER_ID);

        await mb.signInAsNormalUser();
      });

      test("revokes ability to create subscriptions and alerts and manage them", async ({
        page,
        mb,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

        await openSharingMenu(page);
        // One-shot absence, like upstream — the menu is already open.
        await expect(sharingMenu(page)).toBeVisible();
        expect(await sharingMenu(page).getByText(/subscri/i).count()).toBe(0);

        await visitQuestion(page, ORDERS_QUESTION_ID);
        await expect(tableInteractive(page)).toBeVisible();
        // No public link: the share button only copies the app link, no menu.
        await expect(sharingMenuButton(page)).toHaveAttribute(
          "aria-label",
          "Copy link",
        );

        await page.goto("/account/notifications");
        const list = notificationsList(page);
        await expect(list).toBeVisible();
        // Dividend: upstream only asserted the ABSENCE of the unsubscribe
        // icon, which passes vacuously on an empty list. Gate on the
        // subscription actually being listed first, so the absence is about
        // the control and not about the page.
        await expect(
          list.getByText("Subscription", { exact: true }),
        ).toBeVisible();
        expect(await icon(list, "close").count()).toBe(0);
      });
    });

    test.describe("granted", () => {
      test("gives ability to create dashboard subscriptions and question alerts", async ({
        page,
        mb,
      }) => {
        await configureSmtpSettings(mb.api);
        await mb.signInAsNormalUser();

        // Set up a dashboard subscription
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
        await openDashboardMenu(page, "Subscriptions");
        await expect(
          sidebar(page).getByText("Email this dashboard", { exact: true }),
        ).toBeAttached();

        // Create a question alert
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await page.getByLabel("Move, trash, and more…", { exact: true }).click();
        await popover(page).getByText("Create an alert", { exact: true }).click();
        await expect(
          modal(page).getByText("New alert", { exact: true }),
        ).toBeVisible();
      });
    });
  });

  test.describe("monitoring permission", () => {
    test.describe("granted", () => {
      test.beforeEach(async ({ page, mb }) => {
        await page.goto("/admin/permissions/application");

        await modifyPermission(page, "All Users", MONITORING_INDEX, "Yes");

        await saveChangesToPermissions(page);

        await createErroringQuestion(page, mb.api, {
          name: "broken_question",
          native: { query: "select * from broken_question" },
        });

        await mb.signInAsNormalUser();
      });

      test("allows accessing tools for non-admins", async ({ page }) => {
        await page.goto("/");
        await goToAdmin(page);

        // Tools smoke test
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe("/admin/tools/help");
        await expect(
          page.getByRole("heading", { name: "Help", exact: true }),
        ).toBeVisible();

        await page
          .getByTestId("admin-layout-sidebar")
          .getByText("Erroring questions", { exact: true })
          .click();
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe("/admin/tools/errors");
        await expect(
          page
            .getByTestId("admin-layout-content")
            .getByText("Questions that errored when last run", { exact: true }),
        ).toBeVisible();
      });
    });

    test.describe("revoked", () => {
      test("does not allow accessing admin tools for non-admins", async ({
        page,
        mb,
      }) => {
        await mb.signInAsNormalUser();
        await page.goto("/");
        await getProfileLink(page).click();

        // One-shot absence, like upstream — gate on the menu being open first.
        await expect(popover(page).first()).toBeVisible();
        expect(
          await popover(page).getByText(adminAppLinkText, { exact: true }).count(),
        ).toBe(0);

        await page.goto("/admin/tools/errors");
        await expect(
          main(page).getByText("Sorry, you don’t have permission to see that.", {
            exact: true,
          }),
        ).toBeVisible();

        await page.goto("/admin/tools/help");
        await expect(
          main(page).getByText("Sorry, you don’t have permission to see that.", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });
  });

  test.describe("settings permission", () => {
    test.describe("granted", () => {
      test.beforeEach(async ({ page, mb }) => {
        await page.goto("/admin/permissions/application");

        await modifyPermission(page, "All Users", SETTINGS_INDEX, "Yes");

        await saveChangesToPermissions(page);

        await mb.signInAsNormalUser();
      });

      test("allows editing settings as a non-admin user", async ({ page }) => {
        await page.goto("/admin/settings");
        await expect
          .poll(() => page.url())
          .toContain("/admin/settings/general");

        const content = page.getByTestId("admin-layout-content");
        // One-shot absences, taken once the settings form has rendered.
        await expect(content.getByLabel("Site name", { exact: true })).toBeVisible();
        expect(
          await content.getByText("License and Billing", { exact: true }).count(),
        ).toBe(0);
        expect(await content.getByLabel("Updates", { exact: true }).count()).toBe(
          0,
        );

        const siteName = content.getByLabel("Site name", { exact: true });
        await siteName.fill("NewName");
        await siteName.blur();

        await expect(
          undoToast(page)
            .getByText(/changes saved/i)
            .first(),
        ).toBeVisible();
      });
    });
  });
});
