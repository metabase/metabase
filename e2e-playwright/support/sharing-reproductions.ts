/**
 * Helpers for the sharing/sharing-reproductions port.
 *
 * Ports of:
 * - e2e/support/helpers/e2e-email-helpers.js — clickSend,
 *   openAndAddEmailsToSubscriptions, sendEmailAndAssert, sendEmailAndVisitIt.
 *   `sendEmailAndAssert`/`sendEmailAndVisitIt` upstream do a bare, un-retried
 *   `cy.request` straight after the send; the backend sends on a background
 *   thread, so the ports poll the inbox (see PORTING's `H.getInbox` note).
 * - e2e/support/helpers/e2e-slack-helpers.js — mockSlackConfigured.
 * - createMockDashboardCard (metabase-types/api/mocks) — local stand-in.
 * - ADMIN_USER_ID (cypress_sample_instance_data.js).
 *
 * Everything else the spec needs is imported read-only from the shared
 * modules (porting rule 9: no edits to shared support files).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import type { MetabaseApi } from "./api";
import { getInbox } from "./onboarding-extras";
import type { MaildevEmail } from "./onboarding-extras";

/** WEBMAIL_CONFIG.WEB_PORT from e2e/support/cypress_data.js. */
export const MAILDEV_WEB_URL = "http://localhost:1080";

/** Port of ADMIN_USER_ID (cypress_sample_instance_data.js). */
export const ADMIN_USER_ID: number = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    (candidate) => candidate.email === "admin@metabase.test",
  );
  if (!user) {
    throw new Error('User "admin@metabase.test" not found in instance data');
  }
  return Number(user.id);
})();

/** USERS.admin (e2e/support/cypress_data.js) — the harness USERS map carries
 * only email/password. */
export const ADMIN = {
  first_name: "Bobby",
  last_name: "Tables",
  email: "admin@metabase.test",
} as const;

/** Port of H.getFullName (e2e-users-helpers.ts) for the admin fixture. */
export const ADMIN_FULL_NAME = `${ADMIN.first_name} ${ADMIN.last_name}`;

// === ports of e2e-email-helpers.js ===

/**
 * Port of H.clickSend: click "Send email now" and wait for POST
 * /api/pulse/test. The wait is registered before the click (porting rule 2).
 */
export async function clickSend(page: Page) {
  const emailSent = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/pulse/test",
  );
  await page.getByText("Send email now", { exact: true }).click();
  await emailSent;
}

/** Port of H.openAndAddEmailsToSubscriptions. */
export async function openAndAddEmailsToSubscriptions(
  page: Page,
  recipients: string[],
) {
  await openDashboardSubscriptionsMenu(page);

  await expect(
    sidebar(page).getByText("Set up a dashboard subscription", { exact: true }),
  ).toBeVisible();

  await page.getByText("Email it", { exact: true }).click();

  for (const recipient of recipients) {
    const input = page.getByTestId("token-field").locator("input");
    await input.click();
    await input.pressSequentially(recipient);
    await page.keyboard.press("Enter");
    await input.blur();
  }
}

/**
 * Port of H.sendEmailAndAssert's inbox read: send, then resolve with the
 * FIRST inbox entry (upstream's `body[0]`). Every caller clears the inbox in
 * its beforeEach (setupSMTP does), so entry 0 is the mail under test — but
 * the send lands on a background thread, so poll rather than read once.
 */
export async function sendEmailAndGetFirst(page: Page): Promise<MaildevEmail> {
  await clickSend(page);
  return waitForInboxEntry(0);
}

/**
 * Port of H.sendEmailAndVisitIt: send, then navigate the browser to maildev's
 * rendered-HTML page for the LATEST message (upstream's `body.slice(-1)[0]`).
 */
export async function sendEmailAndVisitIt(page: Page) {
  await clickSend(page);
  const latest = await waitForInboxEntry(-1);
  await page.goto(`${MAILDEV_WEB_URL}/email/${latest.id}/html`);
}

/** Poll the inbox until it is non-empty, then return the entry at `index`
 * (negative counts from the end, mirroring `body.slice(-1)[0]`). */
async function waitForInboxEntry(
  index: number,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<MaildevEmail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const inbox = await getInbox();
    if (inbox.length > 0) {
      return index < 0 ? inbox[inbox.length + index] : inbox[index];
    }
    if (Date.now() > deadline) {
      throw new Error(`Inbox stayed empty for ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** maildev exposes an email's attachment bytes at this path. */
export async function fetchEmailAttachment(
  emailId: string,
  generatedFileName: string,
): Promise<string> {
  const response = await fetch(
    `${MAILDEV_WEB_URL}/email/${emailId}/attachment/${generatedFileName}`,
  );
  return await response.text();
}

export type MaildevAttachment = {
  contentType: string;
  generatedFileName: string;
};

/** maildev's attachment metadata — not modelled by the shared MaildevEmail. */
export function emailAttachments(email: MaildevEmail): MaildevAttachment[] {
  return (
    (email as unknown as { attachments?: MaildevAttachment[] }).attachments ?? []
  );
}

// === port of e2e-slack-helpers.js ===

const MOCKED_SLACK = {
  type: "slack",
  name: "Slack",
  allows_recipients: true,
  schedules: ["hourly", "daily", "weekly", "monthly"],
  fields: [
    {
      name: "channel",
      type: "select",
      displayName: "Post to",
      options: [
        { displayName: "#work", id: "C001" },
        { displayName: "#play", id: "C002" },
      ],
      required: true,
    },
  ],
  configured: true,
};

/**
 * Port of H.mockSlackConfigured: read the real /api/pulse/form_input (so the
 * email channel config is preserved), then route the endpoint to a copy with
 * a fake, configured Slack channel. Register before the navigation that
 * fetches it.
 */
export async function mockSlackConfigured(page: Page, api: MetabaseApi) {
  const original = (await (await api.get("/api/pulse/form_input")).json()) as {
    channels: Record<string, unknown>;
  };
  const mocked = {
    ...original,
    channels: {
      email: original.channels.email,
      slack: MOCKED_SLACK,
    },
  };
  await page.route(
    (url) => url.pathname === "/api/pulse/form_input",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mocked),
      }),
  );
}

// === misc ports ===

/**
 * Local stand-in for createMockDashboardCard (metabase-types/api/mocks) — the
 * repo import is outside e2e-playwright's tsconfig. `card` is omitted: it
 * would need createMockCard and the PUT ignores it.
 */
export function mockDashboardCard(
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    dashboard_id: 1,
    dashboard_tab_id: null,
    col: 0,
    row: 0,
    card_id: 1,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    inline_parameters: null,
    parameter_mappings: [],
    ...options,
  };
}

/** Port of H.sidebar (e2e-ui-elements-helpers.js): `cy.get("main aside")`. */
export function sidebar(page: Page): Locator {
  return page.locator("main aside");
}

/** Port of H.openDashboardMenu("Subscriptions"). Inlined rather than imported
 * so the popover click can be scoped the same way upstream's helper does. */
export async function openDashboardSubscriptionsMenu(page: Page) {
  await page
    .getByTestId("dashboard-header")
    .getByLabel("Move, trash, and more…")
    .click();
  await page
    .locator(".popover[data-state~='visible'],[data-element-id=mantine-popover]")
    .filter({ visible: true })
    .getByText("Subscriptions", { exact: true })
    .click();
}

/**
 * The computed font-family of the embed preview iframe's body.
 * `H.getIframeBody().should("have.css", "font-family", …)` in Cypress reads
 * the iframe document's body; Playwright needs an explicit evaluate.
 */
export async function iframeBodyFontFamily(page: Page): Promise<string> {
  const body = page.frameLocator("iframe").locator("body");
  await expect(body).toBeAttached();
  return await body.evaluate(
    (element) => window.getComputedStyle(element).fontFamily,
  );
}
