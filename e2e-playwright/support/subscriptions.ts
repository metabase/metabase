/**
 * Per-spec helpers for the port of
 * e2e/test/scenarios/sharing/subscriptions.cy.spec.js.
 *
 * Ports of:
 * - the spec's own module-level helper functions (openDashboardSubscriptions,
 *   assignRecipient(s), clickButton, createEmailSubscription,
 *   openSlackCreationForm, openRecipientsWithUserVisibilitySetting,
 *   addParametersToDashboard, addConnectedAndUnconnectedParameterToDashboard,
 *   setTextFilter)
 * - the subscription/email members of e2e/support/helpers/e2e-email-helpers.js
 *   that support/onboarding-extras.ts does NOT already cover (clickSend,
 *   sendEmailAndAssert, sendEmailAndVisitIt, viewEmailPage, openEmailPage,
 *   openAndAddEmailsToSubscriptions, setupSubscriptionWithRecipients,
 *   openPulseSubscription, emailSubscriptionRecipients)
 * - e2e/support/helpers/e2e-slack-helpers.js (mockSlackConfigured)
 *
 * setupSMTP / clearInbox / getInbox / isMaildevRunning are reused read-only
 * from support/onboarding-extras.ts (porting rule 9 — shared modules stay
 * untouched, so anything new lands here).
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { editDashboard, setFilter, sidebar } from "./dashboard";
import { openDashboardMenu } from "./organization";
import { ORDERS_DASHBOARD_ID } from "./sample-data";
import { popover } from "./ui";
import { visitDashboard } from "./ui";

/** WEBMAIL_CONFIG.WEB_PORT from e2e/support/cypress_data.js. */
export const MAILDEV_WEB_URL = "http://localhost:1080";

type Scope = Page | FrameLocator | Locator;

/** maildev's stored-email shape, extended with the attachment fields the
 * "Send only attachments" test reads. */
export type SentEmail = {
  id: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: {
    contentType?: string;
    fileName?: string;
    generatedFileName?: string;
  }[];
};

// === the spec's own helpers ===

/** Port of the spec-local openDashboardSubscriptions. */
export async function openDashboardSubscriptions(
  page: Page,
  api: MetabaseApi,
  dashboardId: number = ORDERS_DASHBOARD_ID,
) {
  await visitDashboard(page, api, dashboardId);
  await openDashboardMenu(page, "Subscriptions");
}

/** The RecipientPicker's TokenField input. */
export function recipientInput(scope: Scope): Locator {
  return scope.getByPlaceholder("Enter user names or email addresses", {
    exact: true,
  });
}

/** The TokenField's raw input — what H.openAndAddEmailsToSubscriptions targets
 * (`cy.findByTestId("token-field").find("input")`). Unlike the placeholder
 * query this still resolves once a first recipient has been added. */
export function tokenFieldInput(scope: Scope): Locator {
  return scope.getByTestId("token-field").locator("input");
}

/**
 * Port of `<input>.type("First Last{enter}").blur()`.
 *
 * Three things the literal shape would drop:
 * - cy.type() clicks its subject first, so the click is explicit here.
 * - The TokenField's Enter handler reads `state.selectedOptionValue`, which is
 *   recomputed asynchronously as the option list filters — so we gate on the
 *   matching option actually being in the dropdown before pressing Enter
 *   (PORTING: "async-filtered suggestion lists: gate on the element the
 *   handler reads"). A raw email address has no option to select — the
 *   TokenField's parseFreeformValue builds the token — so the gate is skipped
 *   for those.
 * - blur() is upstream's; it also sidesteps the MultiAutocomplete/PillsInput
 *   submit trap, where a real mousedown on a button blurs the focused input,
 *   the form re-renders, and no click is ever delivered.
 */
export async function typeRecipient(input: Locator, value: string) {
  const page = input.page();
  await input.click();
  await input.pressSequentially(value);
  if (!value.includes("@")) {
    await expect(
      popover(page).getByText(value, { exact: true }).first(),
    ).toBeVisible();
  }
  await input.press("Enter");
  // NOT `input.blur()`: RecipientPicker only sets the placeholder while
  // `recipients.length === 0` (RecipientPicker.tsx:49), so the locator that
  // was typed into stops resolving the instant the token is added and the
  // blur burns the whole timeout. Cypress's `.blur()` acted on the already
  // resolved subject; blurring the live activeElement is the equivalent.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
}

/** Port of the spec-local assignRecipient. */
export async function assignRecipient(
  page: Page,
  api: MetabaseApi,
  {
    userFullName,
    dashboardId = ORDERS_DASHBOARD_ID,
  }: { userFullName: string; dashboardId?: number },
) {
  await openDashboardSubscriptions(page, api, dashboardId);
  await page.getByText("Email it", { exact: true }).click();
  await typeRecipient(recipientInput(page), userFullName);
}

/**
 * Port of the spec-local assignRecipients: open the picker, click each user in
 * the dropdown, then Escape out of it.
 */
export async function assignRecipients(
  page: Page,
  api: MetabaseApi,
  {
    firstNames,
    dashboardId = ORDERS_DASHBOARD_ID,
  }: { firstNames: string[]; dashboardId?: number },
) {
  await openDashboardSubscriptions(page, api, dashboardId);
  await page.getByText("Email it", { exact: true }).click();

  await recipientInput(page).click();
  for (const firstName of firstNames) {
    // cy.contains() — case-sensitive substring, first match.
    await popover(page)
      .getByText(new RegExp(escapeRegExp(firstName)))
      .first()
      .click();
  }
  // The TokenField's Escape handler runs on the input's own keydown. Target
  // the token-field input rather than the placeholder query — the placeholder
  // is gone once the first recipient has been picked.
  await tokenFieldInput(page).press("Escape");
}

/** Port of the spec-local clickButton(name). */
export async function clickButton(scope: Scope, name: string) {
  const button = scope.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

/** Port of the spec-local createEmailSubscription. */
export async function createEmailSubscription(
  page: Page,
  api: MetabaseApi,
  userFullName: string,
) {
  await assignRecipient(page, api, { userFullName });
  await clickButton(sidebar(page), "Done");
}

/** Port of the spec-local openSlackCreationForm. */
export async function openSlackCreationForm(page: Page, api: MetabaseApi) {
  await openDashboardSubscriptions(page, api);
  await sidebar(page).getByText("Send it to Slack", { exact: true }).click();
  await expect(
    sidebar(page).getByText("Send this dashboard to Slack", { exact: true }),
  ).toBeVisible();
}

/** Port of the spec-local setTextFilter: H.setFilter("Text or Category", "Is"). */
export async function setTextFilter(page: Page) {
  await setFilter(page, "Text or Category", "Is");
}

/** Port of the spec-local addParametersToDashboard. */
export async function addParametersToDashboard(page: Page) {
  await editDashboard(page);

  await setTextFilter(page);

  await page.getByText("Select…", { exact: true }).first().click();
  await popover(page).getByText("Name", { exact: true }).click();

  // add default value to the above filter
  await page.getByText("No default", { exact: true }).click();
  await popover(page)
    .getByPlaceholder("Search the list", { exact: true })
    .pressSequentially("Corbin");

  await popover(page).getByText("Corbin Mertz", { exact: true }).click();

  // Upstream's click({ force: true }); Cypress force DISPATCHES at the resolved
  // element, so dispatchEvent is the faithful equivalent (a Playwright
  // force-click moves the real mouse and would hit whatever is topmost).
  await popover(page)
    .getByText(/Add filter/)
    .first()
    .dispatchEvent("click");

  await setTextFilter(page);

  await page.getByText("Select…", { exact: true }).first().click();
  await popover(page).getByText("Category", { exact: true }).click();

  await page.getByText("Save", { exact: true }).click();
  await expect(
    page.getByText(/You're editing this dashboard\./),
  ).toHaveCount(0);
}

/** Port of the spec-local addConnectedAndUnconnectedParameterToDashboard. */
export async function addConnectedAndUnconnectedParameterToDashboard(
  page: Page,
) {
  await editDashboard(page);

  await setTextFilter(page);
  await page.getByText("Select…", { exact: true }).first().click();
  await popover(page).getByText("Name", { exact: true }).click();

  await setTextFilter(page);

  await page.getByText("Save", { exact: true }).click();
  await expect(
    page.getByText(/You're editing this dashboard\./),
  ).toHaveCount(0);
}

// === ports of the subscription members of e2e-email-helpers.js ===

/**
 * Port of H.clickSend. `scope` mirrors the one caller that runs it inside an
 * embed iframe (the modular-embedding test's H.getIframeBody().within(...)).
 * waitForResponse is page-level, so it sees the iframe's request too.
 */
export async function clickSend(page: Page, scope: Scope = page) {
  const emailSent = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/pulse/test",
  );
  await scope.getByText("Send email now", { exact: true }).click();
  await emailSent;
}

/**
 * Port of H.sendEmailAndAssert: click send, then read the inbox's FIRST email.
 *
 * Upstream reads `body[0]` with no retry at all. The port polls until the
 * inbox is non-empty before indexing, which is safe here precisely because
 * setupSMTP() clears the inbox in every beforeEach — so exactly one email
 * exists and "first" is unambiguous.
 */
export async function sendEmailAndAssert(
  page: Page,
  callback: (email: SentEmail) => void | Promise<void>,
) {
  await clickSend(page);
  const inbox = await waitForInbox();
  await callback(inbox[0]);
}

/**
 * Port of H.sendEmailAndVisitIt: click send, then navigate to the LAST email's
 * rendered HTML on the maildev web UI.
 */
export async function sendEmailAndVisitIt(page: Page, scope: Scope = page) {
  await clickSend(page, scope);
  const inbox = await waitForInbox();
  const latest = inbox[inbox.length - 1];
  await page.goto(`${MAILDEV_WEB_URL}/email/${latest.id}/html`);
}

/**
 * maildev's list row renders the subject alongside sibling text in one
 * element, so an exact getByText (which compares the element's FULL text)
 * matches nothing where testing-library's exact findByText — which compares
 * an element's own text nodes — matched fine. Substring regex instead.
 */
function emailSubjectRow(page: Page, emailSubject: string): Locator {
  return page.getByText(new RegExp(escapeRegExp(emailSubject))).first();
}

/** Port of H.viewEmailPage: open the maildev UI and click the email by subject. */
export async function viewEmailPage(page: Page, emailSubject: string) {
  await page.goto(MAILDEV_WEB_URL);
  await emailSubjectRow(page, emailSubject).click();
}

/**
 * Port of H.openEmailPage: open the maildev UI, click the first email with
 * this subject, then navigate to that email's rendered-HTML route (which is
 * where the unsubscribe link lives).
 */
export async function openEmailPage(page: Page, emailSubject: string) {
  await page.goto(MAILDEV_WEB_URL);
  await emailSubjectRow(page, emailSubject).click();

  // cy.hash() — "#/email/<id>"; the helper strips the "#" and appends "/html".
  let hash = "";
  await expect(async () => {
    hash = new URL(page.url()).hash;
    expect(hash.startsWith("#/email/")).toBe(true);
  }).toPass();

  await page.goto(`${MAILDEV_WEB_URL}${hash.slice(1)}/html`);
  await expect(emailSubjectRow(page, emailSubject)).toBeVisible();
}

/** Port of H.openAndAddEmailsToSubscriptions. */
export async function openAndAddEmailsToSubscriptions(
  page: Page,
  recipients: string[],
) {
  await openDashboardMenu(page, "Subscriptions");

  await expect(
    sidebar(page).getByText("Set up a dashboard subscription", { exact: true }),
  ).toBeVisible();

  await page.getByText("Email it", { exact: true }).click();

  for (const recipient of recipients) {
    await typeRecipient(tokenFieldInput(page), recipient);
  }
}

/** Port of H.setupSubscriptionWithRecipients. */
export async function setupSubscriptionWithRecipients(
  page: Page,
  recipients: string[],
) {
  await openAndAddEmailsToSubscriptions(page, recipients);
  await sidebar(page).getByText("Done", { exact: true }).click();
}

/** Port of H.openPulseSubscription. */
export async function openPulseSubscription(page: Page) {
  await sidebar(page).getByLabel("Pulse Card", { exact: true }).click();
}

/** Port of H.emailSubscriptionRecipients. */
export async function emailSubscriptionRecipients(page: Page) {
  await openPulseSubscription(page);
  await clickSend(page);
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
 * Port of H.mockSlackConfigured: read the real /api/pulse/form_input (to keep
 * whatever email config is in place) and stub the endpoint with a Slack
 * channel spec bolted on. Register before the navigation that fetches it.
 */
export async function mockSlackConfigured(page: Page, api: MetabaseApi) {
  const response = await api.get("/api/pulse/form_input");
  const body = (await response.json()) as {
    channels: Record<string, unknown>;
  };
  const mockedConfig = {
    ...body,
    channels: { email: body.channels.email, slack: MOCKED_SLACK },
  };

  await page.route(
    (url) => url.pathname === "/api/pulse/form_input",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockedConfig),
      });
    },
  );
}

// === small utilities ===

/**
 * Poll maildev until at least one email is stored. The backend hands the
 * message off on a background thread, so it can land a beat after
 * POST /api/pulse/test answers.
 */
export async function waitForInbox(
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<SentEmail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(`${MAILDEV_WEB_URL}/email`);
    const inbox = (await response.json()) as SentEmail[];
    if (inbox.length > 0) {
      return inbox;
    }
    if (Date.now() > deadline) {
      throw new Error(`maildev inbox was still empty after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
