/**
 * Helpers for the embedding-homepage and onboarding-notifications ports.
 * New file so the shared support modules stay untouched (porting rule 9).
 *
 * Ports of:
 * - H.mockSessionProperty, extended to rewrite several properties in one
 *   route (the embedding-homepage spec sets three in a single intercept)
 * - e2e/support/helpers/e2e-email-helpers.js (setupSMTP / getInbox /
 *   clearInbox) — talking to the REAL maildev container (SMTP :1025, web
 *   API :1080), not stubbed. isMaildevRunning() gates the email describes
 *   so environments without the container skip gracefully.
 * - api/createNotification.ts (createQuestionAlert) and api/createPulse.ts
 * - H.getCurrentUser (e2e-users-helpers), H.notificationList
 *   (e2e-ui-elements-helpers)
 * - the notifications spec's openUserNotifications
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

// === port of H.mockSessionProperty (multi-property variant) ===

/**
 * Fetch the real /api/session/properties response and overwrite the given
 * properties. Native fetch instead of route.fetch() — the latter chokes on
 * the backend's set-cookie headers when the runner is bun (same workaround
 * as support/admin-extras.ts). Register before page.goto.
 */
export async function mockSessionProperties(
  page: Page,
  properties: Record<string, unknown>,
) {
  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      Object.assign(body, properties);
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

// === ports of e2e/support/helpers/e2e-email-helpers.js (real maildev) ===

/** WEBMAIL_CONFIG from e2e/support/cypress_data.js. */
const MAILDEV_WEB_URL = "http://localhost:1080";
const MAILDEV_SMTP_PORT = 1025;

/**
 * Availability probe for gating the email describes: environments without
 * the maildev container (fetch fails or times out) should test.skip.
 */
export async function isMaildevRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILDEV_WEB_URL}/email`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Port of H.setupSMTP: PUT /api/email live-validates the SMTP connection
 * against the maildev container (unlike admin-extras' configureSmtpSettings,
 * which writes the settings without validating). Requires an admin session.
 * Always clears the inbox, like the Cypress helper.
 */
export async function setupSMTP(api: MetabaseApi) {
  await api.put("/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": MAILDEV_SMTP_PORT,
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
    "email-from-name": "Metabase",
    "email-reply-to": ["reply-to@metabase.test"],
  });
  await clearInbox();
}

/** Port of H.clearInbox. */
export async function clearInbox() {
  await fetch(`${MAILDEV_WEB_URL}/email/all`, { method: "DELETE" });
}

type MaildevAddressee = { address?: string } | string;

export type MaildevEmail = {
  id: string;
  subject: string;
  text?: string;
  html?: string;
  to?: MaildevAddressee[];
  cc?: MaildevAddressee[];
  bcc?: MaildevAddressee[];
  envelope?: { to?: MaildevAddressee[] };
};

/** One-shot inbox fetch (H.getInbox without the retry — see waitForEmail). */
export async function getInbox(): Promise<MaildevEmail[]> {
  const response = await fetch(`${MAILDEV_WEB_URL}/email`);
  return (await response.json()) as MaildevEmail[];
}

/**
 * All addresses an email was sent to. The alert lifecycle emails go out
 * bcc-style (send-email! bcc? = true in channel/email/messages.clj), so the
 * To header may be empty — the SMTP envelope is the reliable record.
 */
export function emailAddressees(email: MaildevEmail): string[] {
  const entries = [
    ...(email.to ?? []),
    ...(email.cc ?? []),
    ...(email.bcc ?? []),
    ...(email.envelope?.to ?? []),
  ];
  return entries
    .map((entry) => (typeof entry === "string" ? entry : (entry.address ?? "")))
    .filter((address) => address.length > 0);
}

/**
 * Poll the inbox until an email matches (port of getInboxWithRetry). The
 * backend sends these emails on a background thread (send-email! wraps a
 * future), so they land a beat after the API response.
 */
export async function waitForEmail(
  predicate: (email: MaildevEmail) => boolean,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<MaildevEmail> {
  const deadline = Date.now() + timeoutMs;
  let inbox: MaildevEmail[] = [];
  for (;;) {
    inbox = await getInbox();
    const match = inbox.find(predicate);
    if (match) {
      return match;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No email matched within ${timeoutMs}ms; inbox subjects: [${inbox
          .map((email) => email.subject)
          .join(", ")}]`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// === ports of api helpers ===

/** Port of H.getCurrentUser, reduced to the id the notifications spec needs. */
export async function getCurrentUserId(api: MetabaseApi): Promise<number> {
  const response = await api.get("/api/user/current");
  const { id } = (await response.json()) as { id: number };
  return id;
}

type NotificationRecipient = {
  type: "notification-recipient/user" | "notification-recipient/raw-value";
  user_id?: number;
  details?: { value: string } | null;
};

export type NotificationHandler = {
  channel_type: "channel/email" | "channel/slack";
  recipients: NotificationRecipient[];
};

/** Port of H.createQuestionAlert (api/createNotification.ts). */
export async function createQuestionAlert(
  api: MetabaseApi,
  {
    card_id,
    send_once = false,
    send_condition = "has_result",
    user_id,
    cron_schedule = "0 0 9 * * ?",
    handlers,
  }: {
    card_id: number;
    send_once?: boolean;
    send_condition?: string;
    user_id?: number;
    cron_schedule?: string;
    handlers?: NotificationHandler[];
  },
): Promise<{ id: number }> {
  const response = await api.post("/api/notification", {
    payload_type: "notification/card",
    payload: { card_id, send_once, send_condition },
    handlers: handlers || [
      {
        channel_type: "channel/email",
        recipients: [
          { type: "notification-recipient/user", user_id, details: null },
        ],
      },
    ],
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule,
      },
    ],
  });
  return (await response.json()) as { id: number };
}

/** Port of H.createPulse (api/createPulse.ts). */
export async function createPulse(
  api: MetabaseApi,
  {
    name = "Pulse",
    cards = [],
    channels = [],
    dashboard_id,
  }: {
    name?: string;
    cards?: Record<string, unknown>[];
    channels?: Record<string, unknown>[];
    dashboard_id?: number;
  },
): Promise<{ id: number }> {
  const response = await api.post("/api/pulse", {
    name,
    cards,
    channels,
    dashboard_id,
  });
  return (await response.json()) as { id: number };
}

// === UI helpers ===

/** Port of H.notificationList: findByRole("list", { name: "undo-list" }). */
export function notificationList(page: Page): Locator {
  return page.getByRole("list", { name: "undo-list", exact: true });
}

/**
 * Port of the spec's openUserNotifications: visit /account/notifications and
 * wait for the subscriptions load. The waitForResponse is registered before
 * the navigation that triggers it (porting rule 2).
 */
export async function openUserNotifications(page: Page) {
  const subscriptionsLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/pulse",
  );
  await page.goto("/account/notifications");
  await subscriptionsLoaded;
}
