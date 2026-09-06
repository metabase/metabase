/**
 * Playwright port of e2e/test/scenarios/sharing/invite-to-view.cy.spec.js
 *
 * Notes on the port:
 * - Spec-local helpers live in support/invite-to-view.ts (inviteEmail,
 *   inviteFromShareMenu, joinUrlFromEmail, completeSignup, enableGoogleSSO)
 *   plus revokeCollectionAccess for the permissions test's graph round-trip.
 * - `cy.intercept("POST", "/api/user").as("createUser")` + `cy.wait` →
 *   `page.waitForResponse` registered BEFORE the invite click (rule 2). The
 *   request body is read off `response.request().postDataJSON()`.
 * - The three email describes need the maildev container
 *   (`bunx maildev@2.0.5 -s 1025 -w 1080`, or
 *   `docker run -d -p 1080:1080 -p 1025:1025 maildev/maildev:2.0.5`) and skip
 *   without it — the same gate multi-factor-auth / onboarding-notifications
 *   use. **Pin 2.0.5**: maildev 3.x moved its REST API to /api/email, so
 *   `isMaildevRunning()` probes the 2.x path, returns false, and every email
 *   test silently gate-skips while the run still reports green.
 *   These four tests genuinely read the inbox, so `setupSMTP` (PUT /api/email,
 *   live-validated) is the right helper here — `configureSmtpSettings` would
 *   only supply the "email is configured" state.
 * - Upstream reads the invite with `H.getInbox().then(({ body: [email] }) => …)`,
 *   which resolves as soon as the inbox is NON-EMPTY and then asserts on
 *   `body[0]`. The backend sends on a background thread (send-email! wraps a
 *   future), so with any earlier mail present that is a race. Ported as
 *   `waitForEmail(addressed to this invitee)` — each test mints a random
 *   invitee address, so the match is unambiguous.
 * - `cy.location("pathname").should("match", …)` retried in Cypress → an
 *   `expect.poll` here (a one-shot check catches transient states).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { ALL_USERS_GROUP } from "../support/create-queries";
import {
  completeSignup,
  enableGoogleSSO,
  inviteEmail,
  inviteFromShareMenu,
  joinUrlFromEmail,
  revokeCollectionAccess,
} from "../support/invite-to-view";
import {
  emailAddressees,
  isMaildevRunning,
  setupSMTP,
  waitForEmail,
} from "../support/onboarding-extras";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { visitDashboard, visitQuestion } from "../support/ui";

/** POST /api/user — the "@createUser" alias. */
function createUserResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/user",
  );
}

/** The invite email sent to `email` (see the getInbox note in the header). */
function waitForInviteEmail(email: string) {
  return waitForEmail((sent) => emailAddressees(sent).includes(email));
}

test.describe("scenarios > sharing > invite someone to view", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("invite action in the Share menu", () => {
    test("invites someone to view a dashboard", async ({ page, mb }) => {
      const email = inviteEmail();
      const createUser = createUserResponse(page);

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await inviteFromShareMenu(page, email);

      const body = (await createUser).request().postDataJSON();
      expect(body.email).toBe(email);
      expect(body.invite_target).toMatchObject({
        type: "dashboard",
        id: ORDERS_DASHBOARD_ID,
      });
    });

    test("invites someone to view a question", async ({ page }) => {
      const email = inviteEmail();
      const createUser = createUserResponse(page);

      await visitQuestion(page, ORDERS_QUESTION_ID);
      await inviteFromShareMenu(page, email);

      const body = (await createUser).request().postDataJSON();
      expect(body.invite_target).toMatchObject({
        type: "question",
        id: ORDERS_QUESTION_ID,
      });
    });
  });

  test.describe("invite email", () => {
    test.beforeEach(async ({ mb }) => {
      test.skip(!(await isMaildevRunning()), "maildev container is not running");
      await setupSMTP(mb.api);
    });

    test("scopes the subject/body to the dashboard and links to it", async ({
      page,
      mb,
    }) => {
      const email = inviteEmail();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await inviteFromShareMenu(page, email);

      const sent = await waitForInviteEmail(email);
      expect(sent.subject).toContain("invited to view the dashboard");
      expect(sent.html).toContain(`/dashboard/${ORDERS_DASHBOARD_ID}`);
      expect(sent.html).toContain("wants to share a Metabase dashboard with you");
    });

    test("uses the SSO login link (not a password reset) when password login is disabled", async ({
      page,
      mb,
    }) => {
      test.skip(
        !resolveToken("pro-self-hosted"),
        "no pro-self-hosted token available",
      );
      await enableGoogleSSO(mb.api);
      await mb.api.put("/api/setting", { "enable-password-login": false });

      const email = inviteEmail();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await inviteFromShareMenu(page, email);

      const sent = await waitForInviteEmail(email);
      expect(sent.html).toMatch(
        new RegExp(
          `/auth/login\\?redirect(&#x3D;|=)/dashboard/${ORDERS_DASHBOARD_ID}`,
        ),
      );
      expect(sent.html).not.toContain("reset_password");
    });
  });

  test.describe("landing after signup", () => {
    test.beforeEach(async ({ mb }) => {
      test.skip(!(await isMaildevRunning()), "maildev container is not running");
      await setupSMTP(mb.api);
    });

    test("lands the invited user on the shared dashboard after they set a password", async ({
      page,
      mb,
    }) => {
      const email = inviteEmail();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await inviteFromShareMenu(page, email);

      const sent = await waitForInviteEmail(email);
      await mb.signOut();
      await page.goto(joinUrlFromEmail(String(sent.html)));
      await completeSignup(page);

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}(-|/|$)`));
    });
  });

  test.describe("permissions", () => {
    test.beforeEach(async ({ mb }) => {
      test.skip(!(await isMaildevRunning()), "maildev container is not running");
      await setupSMTP(mb.api);
    });

    // The redirect only navigates; it is not an access grant. An invitee whose
    // group cannot see the dashboard's collection lands on the route but hits
    // the no-access screen.
    test("does not grant access to the shared item", async ({ page, mb }) => {
      const collectionResponse = await mb.api.post("/api/collection", {
        name: "Restricted",
        parent_id: null,
      });
      const collection = (await collectionResponse.json()) as { id: number };

      // revoke the All Users group's access to the new collection
      await revokeCollectionAccess(mb.api, ALL_USERS_GROUP, collection.id);

      const dashboardResponse = await mb.api.post("/api/dashboard", {
        name: "Secret dashboard",
        collection_id: collection.id,
      });
      const dashboard = (await dashboardResponse.json()) as { id: number };

      const email = inviteEmail();
      await visitDashboard(page, mb.api, dashboard.id);
      await inviteFromShareMenu(page, email);

      const sent = await waitForInviteEmail(email);
      await mb.signOut();
      await page.goto(joinUrlFromEmail(String(sent.html)));
      await completeSignup(page);

      await expect(
        page.getByText(/don.t have permission to see that/i),
      ).toBeVisible();
    });
  });
});
