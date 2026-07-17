/**
 * Playwright port of e2e/test/scenarios/onboarding/notifications.cy.spec.js
 *
 * - The Cypress spec never verified the emails the notification lifecycle
 *   sends. The "real email delivery" describe below adds that coverage
 *   against the real maildev container (SMTP :1025, web API :1080): alert
 *   creation, self-unsubscribe, and delete each produce a real email whose
 *   subject and envelope recipients are asserted. Those tests skip when
 *   maildev isn't reachable (CI without the container).
 * - The main describes stay faithful to Cypress (no SMTP configured — the
 *   backend's lifecycle emails are gated on email-configured? / swallowed,
 *   so the UI flows behave identically).
 * - cy.wait("@getAlert") / "@alertUnsubscribe" / "@alertDelete" →
 *   waitForResponse registered before the click that actually fires each
 *   request (porting rule 2).
 * - findByText(..., { exact: false }) is case-insensitive substring in
 *   testing-library → /.../i regexes here.
 */
import type { Page } from "@playwright/test";

import { icon } from "../support/dashboard-cards";
import { modal } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import {
  createPulse,
  createQuestionAlert,
  emailAddressees,
  getCurrentUserId,
  isMaildevRunning,
  notificationList,
  openUserNotifications,
  setupSMTP,
  waitForEmail,
} from "../support/onboarding-extras";
import { undoToastList } from "../support/organization";
import { SAMPLE_DATABASE, USERS } from "../support/sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const getQuestionDetails = () => ({
  name: "Question",
  query: {
    "source-table": ORDERS_ID,
  },
});

const getPulseDetails = ({
  card_id,
  dashboard_id,
}: {
  card_id: number;
  dashboard_id: number;
}) => ({
  name: "Subscription",
  dashboard_id,
  cards: [
    {
      id: card_id,
      include_csv: false,
      include_xls: false,
    },
  ],
  channels: [
    {
      enabled: true,
      channel_type: "slack",
      schedule_type: "hourly",
    },
  ],
});

async function clickUnsubscribe(page: Page) {
  await page
    .getByTestId("notifications-list")
    .getByLabel("close icon", { exact: true })
    .click();
}

/** The alert-recipient setup shared by the notifications + email describes. */
async function setupQuestionAlert(mb: {
  api: Parameters<typeof createQuestionAlert>[0];
  signInAsAdmin(): Promise<void>;
  signInAsNormalUser(): Promise<void>;
}) {
  await mb.signInAsAdmin();
  const adminId = await getCurrentUserId(mb.api);

  await mb.signInAsNormalUser();
  const userId = await getCurrentUserId(mb.api);

  const { id: cardId } = await mb.api.createQuestion(getQuestionDetails());

  await createQuestionAlert(mb.api, {
    user_id: adminId,
    card_id: cardId,
    handlers: [
      {
        channel_type: "channel/email",
        recipients: [
          {
            type: "notification-recipient/user",
            user_id: userId,
            details: null,
          },
          {
            type: "notification-recipient/user",
            user_id: adminId,
            details: null,
          },
        ],
      },
    ],
  });

  return { adminId, userId, cardId };
}

/** The delete flow of the "single recipient creator" test, shared with the
 * email describe: unsubscribe → confirm → delete, with the response waits
 * registered at their true triggers. */
async function unsubscribeAndDeleteOwnAlert(page: Page) {
  const getAlert = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
  );
  await clickUnsubscribe(page);
  await getAlert;

  const unsubscribeModal = page.getByTestId("alert-unsubscribe");
  await expect(
    unsubscribeModal.getByText("Confirm you want to unsubscribe", {
      exact: true,
    }),
  ).toBeVisible();

  const alertUnsubscribe = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/notification\/\d+\/unsubscribe$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await unsubscribeModal.getByText("Unsubscribe", { exact: true }).click();
  await alertUnsubscribe;

  await expect(
    undoToastList(page).getByText("Successfully unsubscribed.", {
      exact: true,
    }),
  ).toBeVisible();

  const deleteModal = page.getByTestId("alert-delete");
  await expect(
    deleteModal.getByText("You’re unsubscribed. Delete this alert as well?", {
      exact: true,
    }),
  ).toBeVisible();

  const alertDelete = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
  );
  await deleteModal.getByText("Delete it", { exact: true }).click();
  await alertDelete;

  await expect(
    notificationList(page).getByText("The alert was successfully deleted.", {
      exact: true,
    }),
  ).toBeVisible();

  await expect(modal(page)).toHaveCount(0);
  // Faithful to Cypress: singular "notification-list" (the plural testid is
  // the one the page uses; this assertion trivially holds there too).
  await expect(page.getByTestId("notification-list")).toHaveCount(0);
}

test.describe("scenarios > account > notifications", () => {
  test.describe("notifications", () => {
    let adminId: number;
    let cardId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      ({ adminId, cardId } = await setupQuestionAlert(mb));
    });

    test("should be able to see help info", async ({ page }) => {
      await openUserNotifications(page);

      await page.getByText("Not seeing one here?", { exact: true }).click();

      const helpModal = modal(page);
      await expect(
        helpModal.getByText("Not seeing something listed here?", {
          exact: true,
        }),
      ).toBeVisible();
      await helpModal.getByText("Got it", { exact: true }).click();

      await expect(modal(page)).toHaveCount(0);
    });

    test("should be able to see alerts notifications", async ({ page }) => {
      await openUserNotifications(page);

      const list = page.getByTestId("notifications-list");
      await expect(list.getByText("Question", { exact: true })).toBeVisible();
      await expect(list.getByText(/daily at 9:00 am/i)).toBeVisible();
      await expect(list.getByText(/created by you/i)).toBeVisible();
    });

    test("should be able to delete an alert when the user created it and he is a single recipient", async ({
      page,
    }) => {
      await openUserNotifications(page);

      await expect(
        page
          .getByTestId("notifications-list")
          .getByText("Question", { exact: true }),
      ).toBeVisible();

      await unsubscribeAndDeleteOwnAlert(page);
    });

    test("should be able to unsubscribe from an alert when the user has not created it", async ({
      page,
      mb,
    }) => {
      await mb.signOut();
      await mb.signInAsAdmin();
      await openUserNotifications(page);

      await expect(
        page
          .getByTestId("notifications-list")
          .getByText(/created by robert tableton/i),
      ).toBeVisible();

      const getAlert = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
      );
      await clickUnsubscribe(page);
      await getAlert;

      const unsubscribeModal = modal(page);
      await expect(
        unsubscribeModal.getByText("Confirm you want to unsubscribe", {
          exact: true,
        }),
      ).toBeVisible();

      const alertUnsubscribe = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/notification\/\d+\/unsubscribe$/.test(
            new URL(response.url()).pathname,
          ),
      );
      await unsubscribeModal.getByText("Unsubscribe", { exact: true }).click();
      await alertUnsubscribe;

      // This was the admin's only notification and they didn't create it, so
      // unsubscribing empties the list and the notifications-list container
      // unmounts into the empty state. Anchor on the success toast first,
      // then assert the list is gone — don't scope the negative check inside
      // the container that disappears.
      await expect(
        undoToastList(page).getByText("Successfully unsubscribed.", {
          exact: true,
        }),
      ).toBeVisible();

      await expect(page.getByTestId("notifications-list")).toHaveCount(0);
    });

    test("should be able to see created notifications that a user is not subscribed to", async ({
      page,
      mb,
    }) => {
      await createQuestionAlert(mb.api, {
        card_id: cardId,
        cron_schedule: "0 0 3 * * ?",
        handlers: [
          {
            channel_type: "channel/email",
            recipients: [
              {
                type: "notification-recipient/user",
                user_id: adminId,
                details: null,
              },
            ],
          },
        ],
      });

      await openUserNotifications(page);

      const list = page.getByTestId("notifications-list");
      await expect(
        list.getByText("Check daily at 3:00 AM", { exact: true }),
      ).toBeVisible();

      const notificationCard = list
        .getByTestId("notification-alert-item")
        .filter({ hasText: "Check daily at 3:00 AM" });
      await expect(notificationCard.getByText(/created by you/i)).toBeVisible();
      await icon(notificationCard, "close").click();

      await expect(
        modal(page).getByText("Delete this alert?", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("pulses", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
      const { questionId, dashboardId } = await mb.api.createQuestionAndDashboard(
        { questionDetails: getQuestionDetails() },
      );
      await createPulse(
        mb.api,
        getPulseDetails({ card_id: questionId, dashboard_id: dashboardId }),
      );
    });

    test("should be able to see help info", async ({ page }) => {
      await openUserNotifications(page);

      await page.getByText("Not seeing one here?", { exact: true }).click();

      const helpModal = modal(page);
      await expect(
        helpModal.getByText("Not seeing something listed here?", {
          exact: true,
        }),
      ).toBeVisible();
      await helpModal.getByText("Got it", { exact: true }).click();

      await expect(modal(page)).toHaveCount(0);
    });

    test("should be able to see pulses notifications", async ({ page }) => {
      await openUserNotifications(page);

      await expect(page.getByText("Subscription", { exact: true })).toBeVisible();
      await expect(page.getByText(/slack’d hourly/i)).toBeVisible();
      await expect(page.getByText(/created by you/i)).toBeVisible();
    });

    test("should be able to unsubscribe and delete a pulse when the user has created it", async ({
      page,
    }) => {
      await openUserNotifications(page);

      await expect(page.getByText("Subscription", { exact: true })).toBeVisible();
      await clickUnsubscribe(page);

      const deleteModal = modal(page);
      await expect(
        deleteModal.getByText("Delete this subscription?", { exact: true }),
      ).toBeVisible();
      await deleteModal
        .getByText("Yes, delete this subscription", { exact: true })
        .click();

      await expect(page.getByText("Subscription", { exact: true })).toHaveCount(
        0,
      );
    });
  });

  // Coverage the Cypress spec never had: the notification lifecycle emails,
  // delivered through a REAL SMTP server (maildev) and read back through its
  // web API. Skips when the container isn't running.
  test.describe("real email delivery", () => {
    let maildevUp = false;

    test.beforeAll(async () => {
      maildevUp = await isMaildevRunning();
    });

    test.beforeEach(async ({ mb }) => {
      test.skip(
        !maildevUp,
        "maildev is not reachable on http://localhost:1080",
      );

      await mb.restore();
      // setupSMTP live-validates against maildev and clears the inbox; it
      // must run (as admin) BEFORE the alert is created so the creation
      // email is really sent and lands in a clean inbox.
      await mb.signInAsAdmin();
      await setupSMTP(mb.api);
      await setupQuestionAlert(mb);
    });

    test("creating an alert emails the other recipients (but not the creator)", async () => {
      const email = await waitForEmail(
        ({ subject }) => subject === "Robert Tableton added you to an alert",
      );
      expect(emailAddressees(email)).toContain(USERS.admin.email);
      expect(emailAddressees(email)).not.toContain(USERS.normal.email);
    });

    test("unsubscribing from an alert sends a real confirmation email", async ({
      page,
      mb,
    }) => {
      await mb.signOut();
      await mb.signInAsAdmin();
      await openUserNotifications(page);

      const alertUnsubscribe = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/notification\/\d+\/unsubscribe$/.test(
            new URL(response.url()).pathname,
          ),
      );
      await clickUnsubscribe(page);
      await modal(page).getByText("Unsubscribe", { exact: true }).click();
      await alertUnsubscribe;

      await expect(
        undoToastList(page).getByText("Successfully unsubscribed.", {
          exact: true,
        }),
      ).toBeVisible();

      const email = await waitForEmail(
        ({ subject }) => subject === "You unsubscribed from an alert",
      );
      expect(emailAddressees(email)).toContain(USERS.admin.email);
    });

    test("deleting an alert emails the removed recipients", async ({
      page,
    }) => {
      // Signed in as the creator (normal user) from the beforeEach.
      await openUserNotifications(page);
      await unsubscribeAndDeleteOwnAlert(page);

      // The creator's own unsubscribe confirmation...
      const unsubscribed = await waitForEmail(
        ({ subject }) => subject === "You unsubscribed from an alert",
      );
      expect(emailAddressees(unsubscribed)).toContain(USERS.normal.email);

      // ...and the removal notice to the remaining recipient on delete.
      const removed = await waitForEmail(
        ({ subject }) => subject === "You’ve been unsubscribed from an alert",
      );
      expect(emailAddressees(removed)).toContain(USERS.admin.email);
    });
  });
});
