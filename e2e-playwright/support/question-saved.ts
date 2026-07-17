/**
 * Helpers for the question-saved spec port: ports of
 * - e2e-ui-elements-helpers.js (rightSidebar, dashboardCards,
 *   collectionOnTheGoModal)
 * - e2e-datamodel-helpers.ts (DataModel.visit / TablePicker.getTable, minimal)
 * - e2e-embedding-helpers.js (visitEmbeddedPage)
 * - e2e-misc-helpers.js (visitPublicDashboard)
 * - e2e-notification-helpers.ts / e2e-email-helpers.js /
 *   e2e-sharing-helpers.ts (webhook + alert-channel helpers)
 * plus the instance-data ids the spec needs.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { modal } from "./models";
import { popover } from "./ui";

/** The mb fixture surface these helpers need (the harness class itself is
 * private to fixtures.ts). */
type SessionHarness = { api: MetabaseApi; signOut(): Promise<void> };

// === instance-data ids (same lookup pattern as sample-data.ts) ===

type InstanceEntity = { id: number | string; name: string };

const findByName = (entities: InstanceEntity[], name: string): number => {
  const entity = entities.find((entity) => entity.name === name);
  if (!entity) {
    throw new Error(
      `Entity "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(entity.id);
};

export const SECOND_COLLECTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.collections,
  "Second collection",
);

export const ORDERS_BY_YEAR_QUESTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.questions,
  "Orders, Count, Grouped by Created At (year)",
);

// === ports of e2e-ui-elements-helpers.js ===

/** Port of H.rightSidebar(). */
export function rightSidebar(page: Page): Locator {
  return page.getByTestId("sidebar-right");
}

/** Port of H.dashboardCards(). */
export function dashboardCards(page: Page): Locator {
  return page.locator("[data-element-id='dashboard-cards-container']");
}

/** Port of H.collectionOnTheGoModal(). */
export function collectionOnTheGoModal(page: Page): Locator {
  return page.getByTestId("create-collection-on-the-go");
}

// === minimal port of e2e-datamodel-helpers.ts ===

/**
 * Port of H.DataModel.visit() with no arguments: open /admin/datamodel and
 * wait for the database list request the page fires.
 */
export async function visitDataModel(page: Page) {
  const databases = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/database",
  );
  await page.goto("/admin/datamodel");
  await databases;
}

/** Port of H.DataModel.TablePicker.getTable(name). */
export function tablePickerTable(page: Page, name: string): Locator {
  return page
    .locator('[data-testid="tree-item"][data-type="table"]')
    .filter({ hasText: name });
}

// === port of H.visitEmbeddedPage (e2e-embedding-helpers.js) ===

// From e2e/support/cypress_data.js.
const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const JWT_SIGN_SCRIPT = path.resolve(
  __dirname,
  "../../e2e/support/external/e2e-jwt-sign.js",
);

export type EmbedPayload = {
  resource: { question: number } | { dashboard: number };
  params: Record<string, unknown>;
};

/**
 * Port of H.visitEmbeddedPage, options-free variant (the saved spec passes no
 * pageStyle/hash options). Signs the token with the same node script Cypress
 * shells out to, then visits the embed URL logged out.
 */
export async function visitEmbeddedPage(
  page: Page,
  mb: SessionHarness,
  payload: EmbedPayload,
) {
  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };
  const token = execFileSync(
    "node",
    [JWT_SIGN_SCRIPT, JSON.stringify(payloadWithExpiration), METABASE_SECRET_KEY],
    { encoding: "utf8" },
  ).trim();
  const embeddableObject = "question" in payload.resource
    ? "question"
    : "dashboard";

  // Always visit the embedded page logged out.
  await mb.signOut();
  await page.goto(`/embed/${embeddableObject}/${token}`);
}

// === port of H.visitPublicDashboard (e2e-misc-helpers.js) ===

export async function visitPublicDashboard(
  page: Page,
  mb: SessionHarness,
  id: number,
  {
    params = {},
    hash = {},
  }: {
    params?: Record<string, string>;
    hash?: Record<string, string>;
  } = {},
) {
  const response = await mb.api.post(`/api/dashboard/${id}/public_link`, {});
  const { uuid } = (await response.json()) as { uuid: string };
  const searchParams = new URLSearchParams(params).toString();
  const searchSection = searchParams ? `?${searchParams}` : "";
  const hashParams = new URLSearchParams(hash).toString();
  const hashSection = hashParams ? `#${hashParams}` : "";

  await mb.signOut();
  await page.goto(`/public/dashboard/${uuid}${searchSection}${hashSection}`);
}

// === ports of e2e-notification-helpers.ts ===

export const WEBHOOK_TEST_SESSION_ID = "00000000-0000-0000-0000-000000000000";
export const WEBHOOK_TEST_HOST = "http://127.0.0.1:9080";
export const WEBHOOK_TEST_URL = `${WEBHOOK_TEST_HOST}/${WEBHOOK_TEST_SESSION_ID}`;

/** Port of H.resetWebhookTester (404s when there are no requests yet). */
export async function resetWebhookTester(api: MetabaseApi) {
  await api.fetch(
    "DELETE",
    `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
    { failOnStatusCode: false },
  );
}

/** Port of H.getAlertChannel. */
export function getAlertChannel(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("listitem", { name });
}

// === port of H.setupSMTP (e2e-email-helpers.js) ===

const WEBMAIL_CONFIG = { WEB_PORT: 1080, SMTP_PORT: 1025 };

/**
 * Requires the maildev container:
 * `docker run -d -p 1080:1080 -p 1025:1025 maildev/maildev:2.0.5`
 */
export async function setupSMTP(api: MetabaseApi) {
  await api.put("/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": WEBMAIL_CONFIG.SMTP_PORT,
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
    "email-from-name": "Metabase",
    "email-reply-to": ["reply-to@metabase.test"],
  });
  // Always clear webmail's inbox before each test.
  await api.fetch(
    "DELETE",
    `http://localhost:${WEBMAIL_CONFIG.WEB_PORT}/email/all`,
  );
}

// === ports of e2e-sharing-helpers.ts (alert channel blocks) ===

/** Port of H.removeNotificationHandlerChannel. */
export async function removeNotificationHandlerChannel(
  page: Page,
  channel: string,
) {
  await modal(page)
    .getByTestId("channel-block")
    .filter({ hasText: channel })
    .getByTestId("remove-channel-button")
    .click();
}

/** Port of H.addNotificationHandlerChannel. */
export async function addNotificationHandlerChannel(
  page: Page,
  channel: string,
  { hasNoChannelsAdded = false }: { hasNoChannelsAdded?: boolean } = {},
) {
  const addButton = modal(page).getByText(
    hasNoChannelsAdded ? "Add a destination" : "Add another destination",
    { exact: true },
  );
  await addButton.click();
  await popover(page).getByText(channel, { exact: true }).click();
}
