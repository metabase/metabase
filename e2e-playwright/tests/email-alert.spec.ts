/**
 * Playwright port of e2e/test/scenarios/sharing/alert/email-alert.cy.spec.js
 *
 * Notes on the port:
 *
 * - GATES (upstream tags vs what the code actually needs):
 *   * `describe(..., { tags: "@external" })` on the whole file — genuinely
 *     needed, and needed by EVERY test, because the shared `beforeEach` calls
 *     `H.setupSMTP()`. `PUT /api/email` LIVE-CONNECTS before saving
 *     (metabase.channel.email/check-and-update-settings → test-smtp-connection),
 *     so maildev on :1025 must be up or the hook 400s.
 *   * The `@external` tag is nonetheless OVER-BROAD about *which* container:
 *     `H.setupNotificationChannel({ name: "Webhook" })` in the 12349 test names
 *     webhook-tester, but `POST /api/channel` only INSERTS the row
 *     (src/metabase/channel/api/channel.clj — the connection test is the
 *     separate `POST /api/channel/test`), and the alert that test saves is a
 *     Slack alert that never fires. Nothing in this file crosses the process
 *     boundary to :9080.
 *   * `it("should include branding for OSS instances", { tags: "@OSS" })` —
 *     RED HERRING; see the branding note below. Ported UNGATED.
 *   * Slack is MOCKED (`H.mockSlackConfigured` stubs /api/pulse/form_input), so
 *     no Slack credentials or container are involved.
 *
 * - TOKEN: the predicate behind the three branding tests is
 *   `:include_branding (not (premium-features/enable-whitelabeling?))`
 *   (src/metabase/notification/payload/core.clj:137), consumed by
 *   `{{#if context.include_branding}}` in
 *   src/metabase/channel/email/notification_card.hbs. It is a pure
 *   `:whitelabel` FEATURE check — no build check, no `is-hosted?`
 *   short-circuit — so:
 *     * no token (post-restore, EE jar)  → whitelabeling off → branding SHOWN
 *     * `starter`                        → no :whitelabel     → branding SHOWN
 *     * `pro-self-hosted`                → :whitelabel        → branding HIDDEN
 *   The file therefore runs BOTH arms of its own gate (tests 1/2 off, test 3
 *   on) without any extra probe.
 *
 * - The `@OSS` tag resolves as TOKEN-GATED, NOT BUILD-GATED. "OSS instance"
 *   here means "no :whitelabel feature", which an EE jar with no token
 *   satisfies exactly. There is no upsell-CTA / EE-chrome assertion in it — the
 *   assertion is on the rendered EMAIL served by maildev, which the FE build
 *   cannot influence. `isOssBackend()` gating would have converted a real
 *   assertion into a permanent skip on this (EE-jar) harness.
 *
 * - TOKEN HYGIENE: `mb.restore()` in the beforeEach resets
 *   `premium-embedding-token` (it lives in the `setting` table), so each test
 *   starts clean — but the last test would otherwise leave `pro-self-hosted`
 *   live on the slot. `test.afterAll` clears it, using the cached admin session
 *   directly since Playwright's `request` fixture is test-scoped.
 *
 * - SNOWPLOW: INAPPLICABLE. The source spec has no snowplow call sites at all
 *   (no `resetSnowplow` / `expectGoodSnowplowEvent` / `enableTracking`), so
 *   there is nothing to observe and neither vantage (browser boundary for FE
 *   events, per-slot collector for backend events) applies.
 *
 * - `cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true")` is DEAD SETUP — the
 *   name appears nowhere under frontend/src. Ported verbatim for faithfulness.
 *
 * - `cy.intercept("POST", "/api/notification").as("saveAlert")` is a plain
 *   string matcher, i.e. an EXACT pathname — `/api/notification/send` (which
 *   the branding tests fire) is a different path and was never aliased.
 *
 * - VACUOUS/WEAK upstream assertions kept verbatim, flagged inline:
 *   * the 12349 test ends on a bare `.click()` of "Delete this alert" with no
 *     follow-up — nothing verifies the alert was actually deleted.
 *   * the branding assertions' `should("contain", "Metabase")` is chai-jquery
 *     ANY-OF over the filtered set, while the chained `.and("have.attr", ...)`
 *     reads jQuery `.attr()`, i.e. the FIRST element. Reproduced as written
 *     rather than collapsed into one locator.
 */
import type { Page } from "@playwright/test";

import { openTable } from "../support/ad-hoc-question";
import type { MetabaseApi } from "../support/api";
import {
  ALERT_BRANDING_HREF,
  countPosts,
  directText,
  linksContaining,
  openAlertForQuestion,
  saveAlert,
  sendAlertAndVisitIt,
} from "../support/email-alert";
import { createNativeQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { setupNotificationChannel } from "../support/metric-page";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import {
  addNotificationHandlerChannel,
  removeNotificationHandlerChannel,
} from "../support/question-saved";
import {
  LOGIN_CACHE,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { mockSlackConfigured } from "../support/subscriptions";
import { modal, popover, visitQuestion } from "../support/ui";

const { PEOPLE_ID } = SAMPLE_DATABASE;

type NotificationHandler = {
  channel_type: string;
  recipients: { details: { value: string; channel_id?: string } }[];
};
type SavedNotification = { handlers: NotificationHandler[] };

test.describe("scenarios > alert > email_alert", () => {
  let maildevUp = false;
  /** Captured for the afterAll token cleanup — fixtures are test-scoped. */
  let slotBaseUrl: string | undefined;

  test.beforeAll(async () => {
    maildevUp = await isMaildevRunning();
  });

  test.beforeEach(async ({ context, mb }) => {
    test.skip(
      !maildevUp,
      "Requires the maildev container (SMTP :1025 / web :1080) — PUT /api/email live-connects before saving",
    );
    slotBaseUrl = mb.baseUrl;

    await mb.restore();
    await mb.signInAsAdmin();
    // Dead setup upstream: metabase.SEEN_ALERT_SPLASH is read nowhere under
    // frontend/src. Kept for faithfulness.
    await context.addCookies([
      {
        name: "metabase.SEEN_ALERT_SPLASH",
        value: "true",
        domain: new URL(mb.baseUrl).hostname,
        path: "/",
      },
    ]);

    await setupSMTP(mb.api);
  });

  // Not upstream. The branding tests activate tokens and Cypress leaves them
  // for the next spec's restore() to clear; on a shared long-lived slot backend
  // that makes a genuinely gated spec look ungated, so clear it explicitly.
  test.afterAll(async () => {
    const sessionId = LOGIN_CACHE.admin?.sessionId;
    if (!slotBaseUrl || !sessionId) {
      return;
    }
    await fetch(`${slotBaseUrl}/api/setting/premium-embedding-token`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: `metabase.SESSION=${sessionId}`,
        "x-metabase-session": sessionId,
      },
      body: JSON.stringify({ value: null }),
    }).catch(() => undefined);
  });

  test("should have no alerts set up initially", async ({ page, mb }) => {
    await page.goto("/");

    const response = await mb.api.get("/api/notification");
    const body = (await response.json()) as { payload_type: string }[];
    const questionAlerts = body.filter(
      (notification) => notification.payload_type === "notification/card",
    );
    expect(questionAlerts).toHaveLength(0);
  });

  test("should set up an email alert", async ({ page }) => {
    await openAlertForQuestion(page, ORDERS_QUESTION_ID);

    // Should not display slack channel if it is not configured metabase#48407
    const configuredChannel = page.getByTestId("alert-configured-channel");
    await expect(
      configuredChannel.getByTestId("loading-indicator"),
    ).toHaveCount(0);
    // directText, not getByText(exact) — see support/email-alert.ts.
    await expect(directText(configuredChannel, "Slack")).toHaveCount(0);

    const saveAlertResponse = waitForSaveAlert(page);
    await page.getByRole("button", { name: "Done", exact: true }).click();

    const body = await saveAlertResponse;
    expect(body.handlers).toHaveLength(1);
    expect(body.handlers[0].channel_type).toBe("channel/email");
  });

  test("should respect email alerts toggled off (metabase#12349)", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("report-timezone", "America/New_York");

    // For this test, we need to pretend that slack is set up
    await mockSlackConfigured(page, mb.api);
    await setupNotificationChannel(mb.api, { name: "Webhook" });

    await openAlertForQuestion(page, ORDERS_QUESTION_ID);

    await removeNotificationHandlerChannel(page, "Email");
    await addNotificationHandlerChannel(page, "Slack", {
      hasNoChannelsAdded: true,
    });

    await modal(page)
      .getByPlaceholder(/Pick a user or channel/)
      .click();
    await popover(page).getByText("#work", { exact: true }).click();

    await addNotificationHandlerChannel(page, "Email");
    await removeNotificationHandlerChannel(page, "Email");

    const saveAlertResponse = waitForSaveAlert(page);
    await modal(page).getByRole("button", { name: "Done", exact: true }).click();

    const body = await saveAlertResponse;
    expect(body.handlers).toHaveLength(1);
    expect(body.handlers[0].channel_type).toBe("channel/slack");

    // ensure that when the alert is deleted, the delete modal is correct
    // metabase#48402
    await page.getByLabel("Move, trash, and more…", { exact: true }).click();
    await popover(page).getByText("Edit alerts", { exact: true }).click();
    await expect(
      modal(page).getByText("Edit alerts", { exact: true }),
    ).toBeVisible();
    // realHover is load-bearing: the row's actions are hidden until hover.
    await modal(page)
      .getByText(/Created by you/)
      .hover();

    // Upstream ends here — the click is the whole assertion (that the button
    // exists and is actionable). Nothing verifies the alert was deleted. Kept
    // verbatim; recorded as weak rather than strengthened.
    await page
      .getByRole("button", { name: "Delete this alert", exact: true })
      .click();
  });

  test("should persist the immutable Slack channel_id alongside the channel name", async ({
    page,
    mb,
  }) => {
    await mockSlackConfigured(page, mb.api);

    await openAlertForQuestion(page, ORDERS_QUESTION_ID);

    await removeNotificationHandlerChannel(page, "Email");
    await addNotificationHandlerChannel(page, "Slack", {
      hasNoChannelsAdded: true,
    });

    await modal(page)
      .getByPlaceholder(/Pick a user or channel/)
      .click();
    await popover(page).getByText("#work", { exact: true }).click();

    const saveAlertResponse = waitForSaveAlert(page);
    await modal(page).getByRole("button", { name: "Done", exact: true }).click();

    const body = await saveAlertResponse;
    // The mocked channel `#work` has id `C001` in e2e-slack-helpers.js.
    // Storing the immutable channel_id at save time is what makes the
    // subscription survive future channel renames in Slack.
    const slackDetails = body.handlers[0].recipients[0].details;
    expect(slackDetails.value).toBe("#work");
    expect(slackDetails.channel_id).toBe("C001");
  });

  test("should set up an email alert for newly created question", async ({
    page,
  }) => {
    await openTable(page, { table: PEOPLE_ID });

    const saveAlertResponse = waitForSaveAlert(page);
    await saveAlert(page);

    await expect(
      page
        .getByTestId("toast-undo")
        .getByText("Your alert is all set up.", { exact: true }),
    ).toBeVisible();

    const body = await saveAlertResponse;
    expect(body.handlers[0].channel_type).toBe("channel/email");
  });

  test("should enable alert to be updated (without updating question) (metabase#36866)", async ({
    page,
  }) => {
    const saveCardCount = countPosts(page, "/api/card");

    await openTable(page, { table: PEOPLE_ID });

    await saveAlert(page);

    // Check that /api/card has been called once
    expect(saveCardCount()).toBe(1);

    await expect(
      page
        .getByTestId("toast-undo")
        .getByText("Your alert is all set up.", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Move, duplicate, and more…", { exact: true }).click();
    await popover(page).getByText("Edit alerts", { exact: true }).click();

    await expect(
      modal(page).getByText("Edit alerts", { exact: true }),
    ).toBeVisible();
    await modal(page)
      .getByText(/Created by you/)
      .click();

    // Change the frequency of the alert to weekly
    await modal(page).getByTestId("select-frequency").click();

    const weeklyOption = page.getByRole("option", { name: /weekly/i });
    await expect(weeklyOption).toHaveAttribute("value", "weekly");
    await expect(weeklyOption).toHaveAttribute("aria-selected", "false");
    await weeklyOption.click();

    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    // Not upstream. Upstream's final `cy.get("@saveCard.all")` is a RETRYING
    // Cypress assertion, so it keeps re-checking while the save is in flight;
    // Playwright's expect() on a plain number is one-shot and would otherwise
    // read the counter before the FE had any chance to fire a second POST.
    // Anchoring on the notification PUT keeps the check meaningful.
    await updateResponse;

    // Check that /api/card has still only been called once
    expect(saveCardCount()).toBe(1);
  });

  test.describe("branding", () => {
    const questionName = "Fourty Two";

    test("should include branding for OSS instances", async ({ page, mb }) => {
      // Upstream tags this @OSS. The predicate is `(not
      // (enable-whitelabeling?))` — a token-feature check with no build check —
      // so an EE jar with no token satisfies it and this runs for real here.
      await sendTestAlertForQuestion(page, mb.api, questionName);
      await expectAlertBranding(page);
    });

    test("should include branding for Starter instances", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("starter");
      await sendTestAlertForQuestion(page, mb.api, questionName);
      await expectAlertBranding(page);
    });

    test("should not include branding on Pro/Enterprise instances", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("pro-self-hosted");
      await sendTestAlertForQuestion(page, mb.api, questionName);
      await expect(linksContaining(page, "Made with")).toHaveCount(0);
    });
  });
});

/** `cy.wait("@saveAlert").then(({ response: { body } }) => ...)`. */
function waitForSaveAlert(page: Page): Promise<SavedNotification> {
  return page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/notification",
    )
    .then((response) => response.json() as Promise<SavedNotification>);
}

/**
 * The two positive branding tests' shared assertion, kept in the upstream
 * shape: an ANY-OF "contains Metabase" plus a FIRST-element href check.
 */
async function expectAlertBranding(page: Page) {
  const brandingLinks = linksContaining(page, "Made with");
  await expect(
    brandingLinks.filter({ hasText: /Metabase/ }).first(),
  ).toBeAttached();
  await expect(brandingLinks.first()).toHaveAttribute(
    "href",
    ALERT_BRANDING_HREF,
  );
}

/** Port of the spec-local sendTestAlertForQuestion(name). */
async function sendTestAlertForQuestion(
  page: Page,
  api: MetabaseApi,
  name: string,
) {
  const card = await createNativeQuestion(api, {
    name,
    native: { query: "select 42" },
  });
  await visitQuestion(page, card.id);

  await page.getByLabel("Move, trash, and more…", { exact: true }).click();
  await popover(page).getByText("Create an alert", { exact: true }).click();
  await sendAlertAndVisitIt(page);

  // `should("be.visible")` on a multi-element subject is ANY-OF (porting
  // rule 3) — maildev renders the question name in more than one anchor.
  await expect(
    linksContaining(page, name).filter({ visible: true }).first(),
  ).toBeVisible();
}
