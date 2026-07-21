/**
 * Playwright port of e2e/test/scenarios/sharing/alert/alert.cy.spec.js
 *
 * Notes on the port:
 *
 * - Spec-local helpers live in support/alert.ts (addEmailRecipient,
 *   setAllowedDomains, isWebhookTesterRunning). Everything else is imported
 *   read-only from existing shared modules.
 *
 * - GATES (upstream tags vs what the code actually needs):
 *   * `describe("with a webhook", { tags: ["@external"] })` — gated here on a
 *     live webhook-tester probe. The tag is OVER-BROAD: `POST /api/channel`
 *     only inserts the row (src/metabase/channel/api/channel.clj:51 — the
 *     connection test lives in the separate `POST /api/channel/test`), and the
 *     alert is created then deleted without ever firing, so nothing in this
 *     describe crosses the process boundary to :9080. Kept anyway to mirror
 *     upstream's declared requirement; see findings-inbox/alert.md.
 *   * `describe("scenarios > sharing > approved domains (EE)", { tags:
 *     "@external" })` — genuinely external: `setupSMTP` PUTs /api/email, which
 *     LIVE-CONNECTS to the SMTP server before saving
 *     (metabase.channel.email/check-and-update-settings → test-smtp-connection),
 *     so maildev on :1025 must be up. It ALSO needs the pro-self-hosted token
 *     (see the token note below), which upstream does not express as a tag.
 *   * `it("can set up an alert for a question saved in a dashboard")` — has NO
 *     tag upstream but calls `H.setupSMTP()`, i.e. it needs maildev just as
 *     much as the EE describe does. MISSING TAG; gated on maildev here.
 *
 * - TOKEN: the EE describe's `H.activateToken("pro-self-hosted")` is load
 *   bearing at TWO points, both hard `:feature :email-allow-list` gates:
 *   1. `defsetting subscription-allowed-domains` (advanced_config/settings.clj)
 *      — without the feature, `setAllowedDomains()` in the beforeEach throws
 *      "Setting subscription-allowed-domains is not enabled", so setup fails.
 *   2. `defenterprise validate-email-domains!` (advanced_config/models/
 *      notification.clj) — the OSS fallback in notification/models.clj returns
 *      nil, so the 403 the third test asserts on never happens.
 *   The FE has no token check at all: RecipientPicker / notifications utils
 *   just read the `subscription-allowed-domains` setting value. That setting is
 *   `:visibility :settings-manager`, which is exactly why the third test works
 *   — a normal user never receives the value, FE validation passes, "Done" is
 *   enabled, and the backend 403 surfaces as the error toast.
 *
 * - `cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true")` is DEAD SETUP: the
 *   name appears nowhere under frontend/src (only in e2e specs). Ported
 *   verbatim for faithfulness.
 *
 * - `cy.findByText("Set up email").closest("a")` → `getByRole("link", ...)`.
 *   ChannelSetupModal renders `<Button component={Link}>`, so the accessible
 *   link IS the `<a>` whose href is asserted. A `getByText(..., {exact:true})`
 *   would strict-mode-violate here: Playwright matches on full textContent, so
 *   both the Mantine Button-label span and its Button-inner wrapper match.
 *
 * - The trash button in the alert list is `display: none` until the list item
 *   is hovered (AlertListItem.module.css). Playwright checks visibility BEFORE
 *   it hovers as part of a click, so the upstream `realHover()` on the
 *   "Created by you" text is reproduced explicitly with `.hover()` and is
 *   required, not decorative.
 *
 * - `cy.findByText(x)` is an existence assertion that also throws on multiple
 *   matches, so it is ported as `toHaveCount(1)` rather than `toBeVisible()`
 *   (which would silently strengthen). Where upstream chained
 *   `.should("be.visible")` explicitly, that is ported too.
 */
import { expect, test } from "../support/fixtures";
import {
  addEmailRecipient,
  isWebhookTesterRunning,
  setAllowedDomains,
} from "../support/alert";
import { resolveToken } from "../support/api";
import { sidebar } from "../support/dashboard";
import { createQuestion } from "../support/factories";
import { setupNotificationChannel } from "../support/metric-page";
import { visitModel } from "../support/models";
import {
  isMaildevRunning,
  notificationList,
  setupSMTP,
} from "../support/onboarding-extras";
import { ORDERS_MODEL_ID, openDashboardMenu } from "../support/organization";
import { addNotificationHandlerChannel } from "../support/question-saved";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { sharingMenuButton } from "../support/sharing";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";

const hasToken = Boolean(resolveToken("pro-self-hosted"));

let maildevUp = false;
let webhookTesterUp = false;

test.describe("scenarios > alert", () => {
  test.beforeAll(async () => {
    maildevUp = await isMaildevRunning();
    webhookTesterUp = await isWebhookTesterRunning();
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("with nothing set", () => {
    test("should prompt you to add email/slack credentials", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText(
          "To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.",
          { exact: true },
        ),
      ).toHaveCount(1);

      const emailLink = dialog.getByRole("link", { name: "Set up email" });
      await expect(emailLink).toBeVisible();
      await expect(emailLink).toHaveAttribute(
        "href",
        "/admin/settings/email",
      );

      const slackLink = dialog.getByRole("link", { name: "Set up Slack" });
      await expect(slackLink).toBeVisible();
      await expect(slackLink).toHaveAttribute(
        "href",
        "/admin/settings/slack",
      );

      const webhookLink = dialog.getByRole("link", { name: "Add a webhook" });
      await expect(webhookLink).toBeVisible();
      await expect(webhookLink).toHaveAttribute(
        "href",
        "/admin/settings/webhooks",
      );
    });

    test("should say to non-admins that admin must add email credentials", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();

      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText(
          "To get notified when something happens, or to send this chart on a schedule, ask your admin to set up email, Slack, or a webhook.",
          { exact: true },
        ),
      ).toHaveCount(1);

      // `not.exist`, asserted two ways so it cannot pass merely because
      // testing-library's exact-match semantics differ from Playwright's:
      // (a) the rendered control — ChannelSetupModal only maps CHANNELS_CONFIG
      //     when userCanAccessSettings, so for a normal user no link exists;
      // (b) the exact text.
      // NOT a bare non-exact getByText: Playwright's substring matching is
      // case-INSENSITIVE, so `getByText("Set up email")` also matches the
      // "…ask your admin to set up email, Slack, or a webhook." paragraph that
      // this very modal is asserted to contain. (Measured — it failed run 1.)
      for (const name of ["Set up email", "Set up Slack", "Add a webhook"]) {
        await expect(dialog.getByRole("link", { name })).toHaveCount(0);
        await expect(dialog.getByText(name, { exact: true })).toHaveCount(0);
      }
    });
  });

  test.describe("with a webhook", () => {
    test.beforeEach(async ({ mb, context }) => {
      test.skip(
        !webhookTesterUp,
        "@external: needs the webhook-tester container on :9080",
      );
      await setupNotificationChannel(mb.api, {
        name: "Foo Hook",
        description: "This is a hook",
      });
      await setupNotificationChannel(mb.api, {
        name: "Bar Hook",
        description: "This is another hook",
      });
      // Dead setup upstream — metabase.SEEN_ALERT_SPLASH is read nowhere in
      // frontend/src. Ported verbatim.
      await context.addCookies([
        {
          name: "metabase.SEEN_ALERT_SPLASH",
          value: "true",
          url: mb.baseUrl,
        },
      ]);
    });

    test("should be able to create and delete alerts with webhooks enabled", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();

      await addNotificationHandlerChannel(page, "Bar Hook");

      await page.getByRole("button", { name: "Done", exact: true }).click();

      await expect(
        notificationList(page).getByText("Your alert is all set up.", {
          exact: true,
        }),
      ).toHaveCount(1);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText("Edit alerts", { exact: true }),
      ).toBeVisible();

      await expect(icon(dialog, "webhook")).toBeVisible();

      const createdBy = dialog.getByText(/Created by you/);
      await expect(createdBy).toBeVisible();
      // Required, not decorative: .actionButtonContainer is display:none until
      // the list item is hovered, and Playwright's visibility check runs before
      // the click's own hover.
      await createdBy.hover();

      await icon(dialog, "trash").click();

      await page.getByRole("button", { name: "Delete it", exact: true }).click();
      await expect(
        notificationList(page).getByText(
          "The alert was successfully deleted.",
          { exact: true },
        ),
      ).toHaveCount(1);

      // delete modal should close
      await expect(modal(page)).toHaveCount(0);
    });
  });

  test("should not be offered for models (metabase#37893)", async ({
    page,
  }) => {
    await visitModel(page, ORDERS_MODEL_ID);
    const viewFooter = page.getByTestId("view-footer");
    const rowCount = viewFooter.getByTestId("question-row-count");
    await expect(rowCount).toHaveText("Showing first 2,000 rows");
    await expect(rowCount).toBeVisible();
    // `should("exist")` — not `toBeVisible`, and not `toHaveCount(1)`: Cypress
    // tolerates multiple matches here.
    await expect(icon(viewFooter, "download")).not.toHaveCount(0);

    await expect(sharingMenuButton(page)).toHaveCount(0);
  });

  test("can set up an alert for a question saved in a dashboard", async ({
    page,
    mb,
  }) => {
    // Untagged upstream, but setupSMTP live-connects to :1025 — see header.
    test.skip(
      !maildevUp,
      "@external (missing upstream): setupSMTP live-validates against the maildev container (SMTP :1025)",
    );
    await setupSMTP(mb.api);

    // Upstream passes `database_id: SAMPLE_DATABASE.id`; the factory's
    // parameter is `database`, and the port exposes the same value as
    // SAMPLE_DB_ID (the JSON fixture here carries only table/field ids).
    const { id: cardId } = await createQuestion(mb.api, {
      name: "Total Orders",
      database: SAMPLE_DB_ID,
      dashboard_id: ORDERS_DASHBOARD_ID,
      query: {
        "source-table": SAMPLE_DATABASE.ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    });
    await visitQuestion(page, cardId);

    await page
      .getByLabel("Move, duplicate, and more…", { exact: true })
      .click();
    await popover(page).getByText("Create an alert", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await page
      .getByLabel("Move, duplicate, and more…", { exact: true })
      .click();
    await popover(page).getByText("Edit alerts", { exact: true }).click();
    const dialog = modal(page);
    await expect(
      dialog.getByText("Edit alerts", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(/Created by you/)).toBeVisible();
  });

  test.describe("scenarios > sharing > approved domains (EE)", () => {
    const allowedDomain = "metabase.test";
    const deniedDomain = "metabase.example";
    const deniedEmail = `mailer@${deniedDomain}`;
    // We're not exposing allowed domains to normal users.
    const normalUserAlertError = `Failed save alert. The following email addresses are not allowed: ${deniedEmail}`;
    const normalUserSubscriptionError = `Cannot create subscription. The following email addresses are not allowed: ${deniedEmail} Please contact your administrator.`;
    const adminAlertError = `You're only allowed to email alerts to addresses ending in ${allowedDomain}`;
    const adminSubscriptionError = `You're only allowed to email subscriptions to addresses ending in ${allowedDomain}`;

    test.beforeEach(async ({ mb }) => {
      test.skip(
        !maildevUp,
        "@external: setupSMTP live-validates against the maildev container (SMTP :1025)",
      );
      test.skip(
        !hasToken,
        "requires the pro-self-hosted token: subscription-allowed-domains and validate-email-domains! are both :feature :email-allow-list",
      );
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await setupSMTP(mb.api);
      await setAllowedDomains(mb.api, allowedDomain);
    });

    test("should validate approved email domains for a question alert", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText("New alert", { exact: true }),
      ).toBeVisible();

      await addEmailRecipient(dialog, deniedEmail);

      await expect(
        dialog.getByText(adminAlertError, { exact: true }),
      ).toHaveCount(1);
      await expect(
        dialog.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
    });

    test("should validate approved email domains for a dashboard subscription (metabase#17977)", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openDashboardMenu(page, "Subscriptions");

      const aside = sidebar(page);
      await aside.getByText("Email it", { exact: true }).click();
      await addEmailRecipient(aside, deniedEmail);

      // Reproduces metabase#17977
      await expect(
        aside.getByRole("button", { name: "Send email now", exact: true }),
      ).toBeDisabled();
      await expect(
        aside.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
      await expect(
        aside.getByText(adminSubscriptionError, { exact: true }),
      ).toHaveCount(1);
    });

    test("should not display the list of approved domains for non-admins (metabase#57138)", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        dialog.getByText("New alert", { exact: true }),
      ).toBeVisible();

      await addEmailRecipient(dialog, deniedEmail);

      await dialog
        .getByRole("button", { name: "Done", exact: true })
        .click();

      const alertToast = page.getByTestId("toast-undo");
      await expect(alertToast).toHaveCount(1);
      await expect(alertToast).toHaveAttribute("color", "feedback-negative");
      await expect(alertToast).toHaveText(normalUserAlertError);

      // Full navigation, so the toast above is torn down with the page — the
      // Playwright toast-lingering trap (exit transitions are only disabled
      // under Cypress, UndoListing.tsx:203) cannot apply across this boundary.
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openDashboardMenu(page, "Subscriptions");

      const aside = sidebar(page);
      await addEmailRecipient(aside, deniedEmail);

      await aside.getByRole("button", { name: "Done", exact: true }).click();

      const subscriptionToast = page.getByTestId("toast-undo");
      await expect(subscriptionToast).toHaveCount(1);
      await expect(subscriptionToast).toHaveAttribute(
        "color",
        "feedback-negative",
      );
      await expect(subscriptionToast).toHaveText(normalUserSubscriptionError);
    });
  });
});
