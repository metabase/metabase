/**
 * Per-spec helpers for the port of
 * e2e/test/scenarios/sharing/alert/email-alert.cy.spec.js.
 *
 * New module (porting rule 9 — shared modules stay untouched). Everything the
 * spec needs that already exists is imported read-only:
 *   - setupSMTP / clearInbox / isMaildevRunning  → support/onboarding-extras.ts
 *   - mockSlackConfigured                        → support/subscriptions.ts
 *   - setupNotificationChannel                   → support/metric-page.ts
 *   - add/removeNotificationHandlerChannel       → support/question-saved.ts
 *
 * What lands here is the spec's own module-level helpers
 * (openAlertForQuestion / saveAlert / sendTestAlertForQuestion), the port of
 * H.sendAlertAndVisitIt (e2e-email-helpers.js), and two small utilities.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { maildevWebUrl } from "./maildev";
import { openSharingMenu } from "./sharing";
import { modal, popover, visitQuestion } from "./ui";


/**
 * The href the "Made with Metabase" anchor carries in
 * src/metabase/channel/email/notification_card.hbs. Duplicated as a literal
 * (not built) so a template change fails the assertion.
 */
export const ALERT_BRANDING_HREF =
  "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=alert";

/**
 * Local copy of the `directText` matcher (support/transforms-template-tags.ts
 * has an identical one; copied rather than imported so this module does not
 * depend on an unrelated spec module).
 *
 * `cy.findByText("Slack")` with a string is testing-library EXACT, and
 * testing-library's `getNodeText` reads only an element's DIRECT CHILD text
 * nodes. Playwright's `getByText(s, {exact:true})` compares the element's FULL
 * `textContent`, so it matches ancestors that testing-library would not — which
 * matters most for the `.should("not.exist")` direction, where the looser
 * matcher makes the absence assertion *harder* to satisfy and can turn a
 * passing upstream test red for the wrong reason.
 */
export function directText(scope: Page | Locator, text: string): Locator {
  return scope.locator(
    `xpath=.//*[normalize-space(text()) = ${xpathLiteral(text)}]`,
  );
}

/** Quote a string for XPath 1.0, which has no escape syntax. */
function xpathLiteral(value: string): string {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `concat(${value
    .split('"')
    .map((part) => `"${part}"`)
    .join(', \'"\', ')})`;
}

/** Escape a string for embedding in a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Counts POSTs to an exact pathname, the way `cy.intercept("POST", "/api/card")
 * .as("saveCard")` + `cy.get("@saveCard.all").should("have.length", 1)` does.
 *
 * Cypress's URL matcher here is a plain string, i.e. an exact path match — so
 * `/api/card/5/query` (also a POST) is NOT counted. The port matches on
 * `pathname === path` for the same reason.
 *
 * Registered on `request`, not `response`: the upstream assertion counts
 * intercepted *requests*, and a request that is still in flight must already be
 * visible (the 36866 regression would otherwise be invisible if the second PUT
 * were slow).
 */
export function countPosts(page: Page, path: string): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === path
    ) {
      count += 1;
    }
  });
  return () => count;
}

/**
 * Port of the spec-local openAlertForQuestion(id).
 */
export async function openAlertForQuestion(page: Page, id: number) {
  await visitQuestion(page, id);
  await page.getByLabel("Move, trash, and more…", { exact: true }).click();
  await popover(page).getByText("Create an alert", { exact: true }).click();
}

/**
 * Port of the spec-local saveAlert().
 *
 * Two Cypress-isms that do not survive a literal translation:
 *  - `cy.findByLabelText("Name").type(" alert")` APPENDS to the prefilled
 *    question name; Playwright's `fill()` replaces. Reproduced with
 *    click + End + pressSequentially so the value ends up "<name> alert".
 *  - `cy.wait("@saveCard")` after `Save` → the waitForResponse is registered
 *    BEFORE the click (porting rule 2).
 */
export async function saveAlert(page: Page) {
  await openSharingMenu(page);

  const saveCard = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );

  const nameInput = modal(page).getByLabel("Name", { exact: true });
  await nameInput.click();
  await nameInput.press("End");
  await nameInput.pressSequentially(" alert");
  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
  await saveCard;

  await page.getByLabel("Move, duplicate, and more…", { exact: true }).click();
  await popover(page).getByText("Create an alert", { exact: true }).click();
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
}

/**
 * Port of H.sendAlertAndVisitIt (e2e-email-helpers.js): press "Send now" in the
 * open New-alert modal, wait for POST /api/notification/send, then navigate the
 * browser to maildev's rendered HTML for the LAST stored email.
 *
 * The one addition over upstream is a poll for the inbox to be non-empty. The
 * backend hands the message to the SMTP thread and answers
 * /api/notification/send before maildev has necessarily stored it; upstream's
 * un-retried `cy.request` is a latent race, not a stronger assertion.
 */
export async function sendAlertAndVisitIt(page: Page) {
  const sent = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/notification/send",
  );

  const alertModal = page.getByLabel("New alert", { exact: true });
  await expect(alertModal).toBeVisible();
  await alertModal.getByText("Send now", { exact: true }).click();
  await sent;

  const inbox = await waitForInbox();
  const latest = inbox[inbox.length - 1];
  await page.goto(`${maildevWebUrl()}/email/${latest.id}/html`);
}

type MaildevEmail = { id: string; subject: string };

/** Poll maildev until at least one email is stored. */
export async function waitForInbox(
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<MaildevEmail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(`${maildevWebUrl()}/email`);
    const inbox = (await response.json()) as MaildevEmail[];
    if (inbox.length > 0) {
      return inbox;
    }
    if (Date.now() > deadline) {
      throw new Error(`maildev inbox was still empty after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * `cy.findAllByRole("link").filter(":contains(text)")`.
 *
 * jQuery's `:contains()` is a CASE-SENSITIVE substring over the element's own
 * text plus its descendants' — Playwright's `filter({ hasText: string })` is
 * case-INsensitive, so a case-sensitive regex is the faithful form (porting
 * rule 1).
 */
export function linksContaining(page: Page, text: string): Locator {
  return page
    .getByRole("link")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });
}
