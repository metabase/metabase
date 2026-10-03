/**
 * Playwright port of e2e/test/scenarios/sharing/alert/alert-permissions.cy.spec.js
 *
 * Notes on the port:
 *
 * - Spec-local helpers live in support/alert-permissions.ts (createBasicAlert,
 *   directTextContaining, createSetupHarness). Everything else is imported
 *   read-only from existing shared / sibling-spec modules.
 *
 * - GATE: `describe(..., { tags: "@external" })` on the whole file. Genuinely
 *   needed, and needed by EVERY test, because the shared `before()` calls
 *   `H.setupSMTP()` — `PUT /api/email` LIVE-CONNECTS before saving
 *   (metabase.channel.email/check-and-update-settings → test-smtp-connection),
 *   so maildev on :1025 must be up or the setup 400s and all three alerts fail
 *   to create. Gated on a live maildev probe rather than an env flag.
 *   * webhook-tester is NOT involved: nothing here creates an HTTP channel.
 *   * maildev is contacted only by `PUT /api/email` (the live connect) and the
 *     inbox DELETE inside `setupSMTP`. No test in this file READS a delivered
 *     message, so mail delivery itself is not a dependency — see findings for
 *     the measured request-delta.
 *
 * - TOKEN: INAPPLICABLE. There is no `activateToken` anywhere in the source and
 *   no premium-feature predicate behind any of these assertions — the
 *   permission split is `canEdit = isAdmin || (canManageSubscriptions &&
 *   isCreatedByCurrentUser(alert))` in AlertListModal.tsx, all OSS. This spec
 *   activates no token and therefore leaves the slot's feature set untouched.
 *
 * - SNOWPLOW: INAPPLICABLE. The source has no snowplow call sites, and (checked
 *   for this spec, not inherited) there is no `trackSimpleEvent` /
 *   `trackSchemaEvent` under frontend/src/metabase/notifications/, so neither
 *   vantage — browser boundary or per-slot collector — has anything to observe.
 *
 * - `before()` NOT `beforeEach()`, per the upstream comment ("the setup is
 *   quite long"). Ported as `test.beforeAll`, which needs its own browser
 *   context because `page`/`mb` are test-scoped — see `createSetupHarness`.
 *   Upstream's adjacent comment ("Make sure that all tests are always able to
 *   run independently!") is ASPIRATIONAL and false as written: the
 *   unsubscribe test removes `normal` from the ORDERS_COUNT alert, which is
 *   exactly the precondition of "should let you see other alerts where you are
 *   a recipient". Cypress's declaration order puts the reader first;
 *   Playwright's does too (fullyParallel: false, workers: 1). Recorded, not
 *   "fixed" — reordering or adding a per-test restore would change what the
 *   suite covers.
 *
 * - FIXTURE IDS are all read from cypress_sample_instance_data at import time,
 *   never hardcoded: ORDERS_QUESTION_ID (94), ORDERS_COUNT_QUESTION_ID (95),
 *   ORDERS_BY_YEAR_QUESTION_ID (96). Full names come from the same USERS table
 *   Cypress uses: admin "Bobby Tables", normal "Robert Tableton".
 *
 * - SIGN-IN: neither the tests nor the setup harness ever POSTs
 *   `/api/session`. `mb.signIn` takes the cached-session branch for both
 *   `admin` and `normal` (both are present in `LOGIN_CACHE`), and
 *   `createSetupHarness` throws rather than falling back. That matters because
 *   a `/api/session` POST through the API request context drops a
 *   `metabase.SESSION` cookie into the jar, and `wrap-session-key` resolves
 *   cookie BEFORE header — so every later API call would silently run as that
 *   user regardless of the header. The "should let you see all created alerts"
 *   test asserts `GET /api/user/current` is the admin for exactly this reason.
 *
 * - ABSENCE ASSERTIONS (there are two, both anchored — see inline comments):
 *   1. `H.popover().findByText("Edit alerts").should("not.exist")` — a
 *      permission-denied-shaped check, i.e. the classic pre-render false pass.
 *   2. `cy.findByText("New alert").should("not.exist")` inside createBasicAlert.
 *
 * - `cy.findByText(x)` with no chained assertion is an existence check that
 *   ALSO throws on multiple matches, so it is ported as `toHaveCount(1)`
 *   rather than `toBeVisible()` (which would silently weaken the uniqueness
 *   half and strengthen the visibility half).
 *
 * - `cy.findByText(..., { exact: false })` on the creator line is
 *   testing-library's case-insensitive SUBSTRING over `getNodeText` (direct
 *   child text nodes only). Playwright's `getByText` — in BOTH forms — reads
 *   full `textContent` and so also matches every ancestor. Ported with
 *   `directTextContaining`; see support/alert-permissions.ts.
 */
import {
  ADMIN_FULL_NAME,
  createBasicAlert,
  createSetupHarness,
  directTextContaining,
} from "../support/alert-permissions";
import { expect, test } from "../support/fixtures";
import {
  isMaildevRunning,
  notificationList,
  setupSMTP,
} from "../support/onboarding-extras";
import { ORDERS_COUNT_QUESTION_ID } from "../support/question-management";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { icon, modal, popover, visitQuestion } from "../support/ui";

/** `0 0 8 ? * 2 *` — Monday 08:00, i.e. the "weekly" preset. */
const WEEKLY_CRON = "0 0 8 ? * 2 *";

test.describe("scenarios > alert > alert permissions", () => {
  let maildevUp = false;

  // Intentional use of beforeAll (not beforeEach) hook because the setup is
  // quite long — upstream's comment, and its `before()` semantics.
  test.beforeAll(async ({ browser, workerBackend }) => {
    maildevUp = await isMaildevRunning();
    if (!maildevUp) {
      return;
    }

    const setup = await createSetupHarness(browser, workerBackend.url);
    try {
      await setup.api.restore();
      await setup.signIn("admin");

      await setupSMTP(setup.api);

      // Create alert as admin
      await visitQuestion(setup.page, ORDERS_QUESTION_ID);
      await createBasicAlert(setup.page);

      // Create alert as admin that user can see
      await visitQuestion(setup.page, ORDERS_COUNT_QUESTION_ID);
      await createBasicAlert(setup.page, { includeNormal: true });

      // Create alert as normal user
      await setup.signIn("normal");
      await visitQuestion(setup.page, ORDERS_BY_YEAR_QUESTION_ID);
      await createBasicAlert(setup.page);
    } finally {
      await setup.dispose();
    }
  });

  test.beforeEach(() => {
    test.skip(
      !maildevUp,
      "Requires the maildev container (SMTP :1025 / web :1080) — the shared setup's PUT /api/email live-connects before saving",
    );
  });

  test.describe("as an admin", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("should let you see all created alerts", async ({ mb }) => {
      // Not upstream: proof that this API call really runs as the admin. The
      // whole test is vacuous if the session in play is anyone else's, and the
      // failure mode is silent (a non-admin sees fewer alerts, not an error).
      const currentUser = await mb.api.get("/api/user/current");
      expect((await currentUser.json()).email).toBe("admin@metabase.test");

      const response = await mb.api.get("/api/notification");
      const body = (await response.json()) as { payload_type: string }[];
      const questionAlerts = body.filter(
        (notification) => notification.payload_type === "notification/card",
      );
      expect(questionAlerts).toHaveLength(3);
    });

    test("should let you edit an alert", async ({ page }) => {
      // Change alert
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      await directTextContaining(modal(page), "Created by you").click();

      await modal(page).getByTestId("select-frequency").click();
      await popover(page)
        .getByRole("option", { name: "weekly", exact: true })
        .click();

      // Registered BEFORE the click that triggers it (the Playwright
      // inversion of cy.intercept + cy.wait).
      const updated = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page)
        .getByRole("button", { name: "Save changes", exact: true })
        .click();

      // Check that changes stuck
      const body = (await (await updated).json()) as {
        subscriptions: { cron_schedule: string }[];
      };
      expect(body.subscriptions[0].cron_schedule).toBe(WEEKLY_CRON);
    });
  });

  test.describe("as a non-admin / normal user", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsNormalUser();
    });

    test("should not let you see other people's alerts", async ({ page }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();

      // POSITIVE ANCHOR, not upstream. The upstream order is
      // absence-then-presence, and the absence half is the pre-render shape:
      // an empty popover satisfies `not.exist` on its FIRST poll, so no amount
      // of retrying can save it. Asserting the popover has rendered its
      // "Create an alert" item first makes the absence check load-bearing.
      // Strengthening on a permission surface, stated explicitly.
      await expect(
        popover(page).getByText("Create an alert", { exact: true }),
      ).toBeVisible();

      await expect(
        popover(page).getByText("Edit alerts", { exact: true }),
      ).toHaveCount(0);
      await expect(
        popover(page).getByText("Create an alert", { exact: true }),
      ).toBeVisible();
    });

    test("should let you see other alerts where you are a recipient", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      const dialog = modal(page);
      await expect(
        directTextContaining(dialog, `Created by ${ADMIN_FULL_NAME}`),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "New alert", exact: true }),
      ).toBeVisible();
    });

    test("should let you see your own alerts", async ({ page }) => {
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      // `cy.findByText` with no chained assertion: exists AND is unique.
      await expect(
        directTextContaining(modal(page), "Created by you"),
      ).toHaveCount(1);
    });

    test("should let you unsubscribe from others' alerts", async ({ page }) => {
      await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      // realHover is load-bearing, not decorative: .actionButtonContainer is
      // `display: none` until the list item is hovered
      // (AlertListItem.module.css), and Playwright evaluates visibility before
      // it hovers as part of a click.
      await directTextContaining(
        modal(page),
        `Created by ${ADMIN_FULL_NAME}`,
      ).hover();
      await icon(modal(page), "unsubscribe").click();

      // QuestionAlertListModal swaps list-modal → unsubscribe-confirm-modal
      // (they never coexist), so `modal(page)` stays unambiguous.
      await expect(
        modal(page).getByText("Confirm you want to unsubscribe", {
          exact: true,
        }),
      ).toHaveCount(1);
      await modal(page)
        .getByRole("button", { name: "Unsubscribe", exact: true })
        .click();

      await expect(
        notificationList(page).getByText("Successfully unsubscribed.", {
          exact: true,
        }),
      ).toHaveCount(1);
    });

    test("should let you edit your own alerts", async ({ page }) => {
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Edit alerts", { exact: true }).click();

      await directTextContaining(modal(page), "Created by you").click();

      const dialog = modal(page);
      await expect(
        dialog.getByText("Edit alert", { exact: true }),
      ).toBeVisible();
      // Before any change, CreateOrEditQuestionAlertModal's submit label is
      // "Done"; it becomes "Save changes" once `hasChanges` flips.
      await expect(
        dialog.getByRole("button", { name: "Done", exact: true }),
      ).toBeEnabled();

      await dialog.getByTestId("select-frequency").click();
      await popover(page)
        .getByRole("option", { name: "weekly", exact: true })
        .click();

      const updated = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page)
        .getByRole("button", { name: "Save changes", exact: true })
        .click();

      // Check that changes stuck
      const body = (await (await updated).json()) as {
        subscriptions: { cron_schedule: string }[];
      };
      expect(body.subscriptions[0].cron_schedule).toBe(WEEKLY_CRON);

      await expect(
        modal(page).getByText("Check on Monday at 8:00 AM", { exact: true }),
      ).toHaveCount(1);
    });
  });
});
