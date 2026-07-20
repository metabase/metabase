/**
 * Playwright port of e2e/test/scenarios/sharing/subscriptions.cy.spec.js
 *
 * Infra tier: REAL EMAIL. The `@external` describes here don't merely need
 * `email-configured?` to be truthy — they send mail through the maildev
 * container (SMTP :1025, web API :1080) and then read it back, and two of them
 * navigate the browser to maildev's own web UI. So `H.setupSMTP()` (which PUTs
 * /api/email and live-validates the connection) is the right port, NOT
 * admin-extras' `configureSmtpSettings`. They gate on `isMaildevRunning()`.
 * maildev is 2.2.1 locally, so the 3.x silent-skip trap does not apply.
 *
 * Notable porting decisions (details inline at each site):
 * - Two upstream absence assertions look for the string "subscriptions"
 *   (lowercase, exact) in the dashboard sharing menu. `DashboardSharingMenu.tsx`
 *   contains no "subscription" text at all, so those locators can never match
 *   in either direction. Ported verbatim with the analysis, not strengthened.
 * - `should("not.have.value")` with no argument is a chai-jquery tautology
 *   (`$el.val() === undefined` is false for any input, so the negation always
 *   passes). Ported as the equally-tautological literal translation, flagged.
 * - cy.intercept().as() + cy.wait() → waitForResponse/waitForRequest registered
 *   before the triggering action (porting rule 2).
 * - `cy.findAllBy…().should("be.disabled"|"be.visible"|"contain")` is an
 *   ANY-of-set assertion in chai-jquery (porting rule 3) → `.first()` on the
 *   visible matches, never a strengthened all-of.
 * - Cypress `click({ force: true })` DISPATCHES at the resolved element;
 *   Playwright's moves the real mouse. `dispatchEvent("click")` is the
 *   faithful equivalent and is used for the two attachment switches, whose
 *   inputs sit behind their labels.
 * - The `@OSS` describe is NOT gated. Probed rather than assumed (PORTING:
 *   "tier gating does not generalise across specs"): with the `isOssBackend`
 *   skip removed, both of its tests PASS on the EE jar, because `restore()`
 *   leaves the instance unlicensed and the "Made with Metabase" branding is
 *   token-gated, not build-gated. Gating them would have thrown away two
 *   executable tests for nothing. (The assertions are matcher-based, so the
 *   "an EE jar with no token still renders EE-build chrome" caveat — which
 *   only bites page-wide upsell counts — does not apply.)
 * - The `@skip`-tagged 28673 test stays declared-and-skipped, like upstream.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { resolveToken } from "../support/api";
import {
  dashboardHeader,
  editDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { addOrUpdateDashboardCard, addTextBox } from "../support/dashboard-management";
import { embedModalContent, embedModalEnableEmbedding } from "../support/embedding";
import { getIframeBody } from "../support/embedding-repros";
import {
  createDashboard,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import { USER_NAMES, getFullName } from "../support/onboarding";
import { openDashboardMenu } from "../support/organization";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  USERS,
} from "../support/sample-data";
import { openSharingMenu, sharingMenu } from "../support/sharing";
import {
  addConnectedAndUnconnectedParameterToDashboard,
  addParametersToDashboard,
  assignRecipient,
  assignRecipients,
  clickButton,
  clickSend,
  createEmailSubscription,
  emailSubscriptionRecipients,
  escapeRegExp,
  mockSlackConfigured,
  openAndAddEmailsToSubscriptions,
  openDashboardSubscriptions,
  openEmailPage,
  openPulseSubscription,
  openSlackCreationForm,
  recipientInput,
  sendEmailAndAssert,
  sendEmailAndVisitIt,
  setTextFilter,
  setupSubscriptionWithRecipients,
  typeRecipient,
  viewEmailPage,
} from "../support/subscriptions";
import { popover, visitDashboard } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID, ORDERS_ID } = SAMPLE_DATABASE as unknown as {
  PRODUCTS: { CREATED_AT: number; CATEGORY: number };
  PRODUCTS_ID: number;
  ORDERS_ID: number;
};

const ADMIN_NAME = getFullName(USER_NAMES.admin);
const NORMAL_NAME = getFullName(USER_NAMES.normal);
const ORDERS_DASHBOARD_NAME = "Orders in a dashboard";

let maildevUp = false;

/** Port of the module-level `H.editDashboard()` + a settled anchor. The EE/OSS
 * describes' beforeEach does a bare `cy.visit("/dashboard/:id")`; Cypress's
 * retries covered the load, so the port anchors on the dashcards instead. */
async function gotoOrdersDashboard(page: Page) {
  await page.goto(`/dashboard/${ORDERS_DASHBOARD_ID}`);
  await expect(
    page.getByTestId("dashboard-parameters-and-cards"),
  ).toBeVisible();
}

/** Port of the spec-local openRecipientsWithUserVisibilitySetting. */
async function openRecipientsWithUserVisibilitySetting(
  page: Page,
  mb: { api: MetabaseApi; signInAsNormalUser: () => Promise<void> },
  setting: string,
) {
  await mb.api.updateSetting("user-visibility", setting);
  await mb.signInAsNormalUser();
  await openDashboardSubscriptions(page, mb.api);

  await recipientInput(sidebar(page)).click();
}

test.describe("scenarios > dashboard > subscriptions", () => {
  test.beforeAll(async () => {
    maildevUp = await isMaildevRunning();
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow sharing if there are no dashboard cards", async ({
    page,
    mb,
  }) => {
    const { id: dashboardId } = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    // Anchor: an absence check taken before the dashboard painted proves
    // nothing (PORTING "absence assertions are vacuous inside a mount-lag
    // window"). The header only renders in the loaded state.
    await expect(dashboardHeader(page)).toBeVisible();
    // NOTE (upstream vacuity): `findByLabelText("subscriptions")` is an EXACT,
    // case-sensitive match and nothing in the dashboard header/sharing menu
    // carries that accessible name — the real menu item is "Subscriptions".
    // Kept verbatim rather than silently strengthened to /subscriptions/i.
    await expect(page.getByLabel("subscriptions", { exact: true })).toHaveCount(
      0,
    );

    await openSharingMenu(page, /public link/i);
    await expect(page.getByTestId("public-link-popover-content")).toBeVisible();

    await openSharingMenu(page, "Embed");
    await expect(embedModalContent(page)).toBeVisible();
  });

  test("should allow sharing if dashboard contains only text cards (metabase#15077)", async ({
    page,
    mb,
  }) => {
    const { id: dashboardId } = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await addTextBox(page, "Foo");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("You're editing this dashboard.", { exact: true }),
    ).toHaveCount(0);

    await openSharingMenu(page);
    // Anchor the absence assertion below on the menu actually being open.
    await expect(sharingMenu(page)).toBeVisible();

    // Dashboard subscriptions are not shown because
    // getting notifications with static text-only cards doesn't make a lot of sense
    //
    // NOTE (upstream vacuity): same lowercase-exact problem as the test above —
    // there is no "subscriptions" text node in DashboardSharingMenu at any
    // time, so this can never fail. Ported verbatim.
    await expect(
      sharingMenu(page).getByText("subscriptions", { exact: true }),
    ).toHaveCount(0);

    await expect(
      sharingMenu(page).getByText("Create a public link", { exact: true }),
    ).toBeVisible();
    await expect(
      sharingMenu(page).getByText("Embed", { exact: true }),
    ).toBeVisible();
  });

  test.describe("sidebar toggling behavior", () => {
    test("should allow toggling the sidebar", async ({ page, mb }) => {
      await openDashboardSubscriptions(page, mb.api);

      // The sidebar starts open after the method there, so test that clicking the icon closes it
      await expect(sidebar(page)).toBeVisible();
      await openDashboardMenu(page, "Subscriptions");
      await expect(sidebar(page)).toHaveCount(0);
    });
  });

  test.describe("with no channels set up", () => {
    test("should instruct user to connect email or slack", async ({
      page,
      mb,
    }) => {
      await openDashboardSubscriptions(page, mb.api);
      // Look for the messaging about configuring slack and email
      await expect(
        page.getByRole("link", { name: /set up email/i }),
      ).toHaveAttribute("href", "/admin/settings/email");
      await expect(
        page.getByRole("link", { name: /configure Slack/i }),
      ).toHaveAttribute("href", "/admin/settings/slack");
    });
  });

  test.describe("with email set up", () => {
    test.beforeEach(async ({ mb }) => {
      test.skip(
        !maildevUp,
        "@external: needs the maildev container (SMTP :1025, web :1080)",
      );
      await setupSMTP(mb.api);
    });

    test("renders an object detail as a label/value table in a subscription email", async ({
      page,
      mb,
    }) => {
      const questionDetails = {
        name: "Object detail static-viz smoke",
        native: {
          query: "SELECT 'Hammer' AS product, 19 AS price, NULL AS discount",
        },
        display: "object",
      };

      const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await openAndAddEmailsToSubscriptions(page, [ADMIN_NAME]);

      await sendEmailAndAssert(page, ({ html }) => {
        expect(html).not.toContain(
          "An error occurred while displaying this card.",
        );
        expect(html).toContain("Hammer");
        // "Empty" (the null column) is unique to the :object renderer — a table fallback leaves it blank.
        expect(html).toContain("Empty");
      });
    });

    test.describe("with no existing subscriptions", () => {
      test("should not enable subscriptions without the recipient (metabase#17657)", async ({
        page,
        mb,
      }) => {
        await openDashboardSubscriptions(page, mb.api);

        await sidebar(page).getByText("Email it", { exact: true }).click();

        // Make sure no recipients have been assigned
        // (cy.findByPlaceholderText carries an implicit existence assertion)
        await expect(recipientInput(page)).toBeVisible();

        // Change the schedule to "Monthly"
        const scheduleType = await findByDisplayValue(sidebar(page), "Hourly");
        await scheduleType.click();
        await popover(page).getByText("Monthly", { exact: true }).click();

        await expect(
          sidebar(page).getByRole("button", { name: "Done", exact: true }),
        ).toBeDisabled();
      });

      test("should allow creation of a new email subscription", async ({
        page,
        mb,
      }) => {
        await createEmailSubscription(page, mb.api, ADMIN_NAME);
        await expect(
          page.getByText("Emailed hourly", { exact: true }),
        ).toBeVisible();
      });

      test("should not add a recipient when Escape is pressed (metabase#24629)", async ({
        page,
        mb,
      }) => {
        await openDashboardSubscriptions(page, mb.api, ORDERS_DASHBOARD_ID);

        await sidebar(page).getByText("Email it", { exact: true }).click();

        await recipientInput(page).click();
        await expect(popover(page)).toBeVisible();
        await expect(popover(page)).toContainText(
          USER_NAMES.admin.first_name,
        );

        await recipientInput(page).press("Escape");
        // H.popover({ skipVisibilityCheck: true }).should("not.be.visible") —
        // our popover() already filters to visible matches, so "no visible
        // popover remains" is the equivalent.
        await expect(popover(page)).toHaveCount(0);

        // NOTE (upstream tautology): chai-jquery's `value` asserts
        // `$el.val() === <arg>`; with no argument that is `=== undefined`,
        // which is false for every input — so `not.have.value` ALWAYS passes.
        // Ported as the literal (equally tautological) translation rather than
        // silently strengthened to `toHaveValue("")`. The real content of this
        // step is that the placeholder query still resolves at all, which only
        // happens while `recipients.length === 0` (RecipientPicker.tsx:49).
        await expect(recipientInput(page)).toBeVisible();
        expect(await recipientInput(page).inputValue()).not.toBe(undefined);

        await expect(page.getByTestId("token-field-popover")).toHaveCount(0);
      });

      test("should not render people dropdown outside of the borders of the screen (metabase#17186)", async ({
        page,
        mb,
      }) => {
        await openDashboardSubscriptions(page, mb.api);

        await page.getByText("Email it", { exact: true }).click();
        await recipientInput(page).click();

        const dropdown = popover(page).first();
        await expect(dropdown).toBeVisible();
        const box = await dropdown.boundingBox();
        const viewport = page.viewportSize();
        expect(box).not.toBeNull();
        expect(viewport).not.toBeNull();
        expect(box!.y).toBeGreaterThan(0);
        expect(box!.y + box!.height).toBeGreaterThan(0);
        expect(box!.y).toBeLessThanOrEqual(viewport!.height);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
      });

      // Upstream carries `{ tags: "@skip" }` — declared but never run.
      test.skip("should not send attachments by default if not explicitly selected (metabase#28673)", async ({
        page,
        mb,
      }) => {
        await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });

        await expect(
          page.getByLabel("Attach results", { exact: true }),
        ).not.toBeChecked();
        await sendEmailAndAssert(page, ({ attachments }) => {
          expect(attachments ?? []).toHaveLength(0);
        });
      });
    });

    test.describe("with existing subscriptions", () => {
      test("should show existing dashboard subscriptions", async ({
        page,
        mb,
      }) => {
        await createEmailSubscription(page, mb.api, ADMIN_NAME);
        await openDashboardSubscriptions(page, mb.api);
        await expect(
          page.getByText("Emailed hourly", { exact: true }),
        ).toBeVisible();
      });

      test("should forward non-admin users to add email form when clicking add", async ({
        page,
        mb,
      }) => {
        await mb.signInAsNormalUser();

        await openDashboardSubscriptions(page, mb.api);

        const bar = sidebar(page);
        await typeRecipient(recipientInput(bar), NORMAL_NAME);
        await clickButton(bar, "Done");

        await bar.getByLabel("add icon", { exact: true }).click();
        await expect(
          bar.getByText("Email this dashboard", { exact: true }),
        ).toHaveCount(1);
      });

      test("should send as BCC by default", async ({ page, mb }) => {
        await assignRecipients(page, mb.api, {
          firstNames: [
            USER_NAMES.admin.first_name,
            USER_NAMES.normal.first_name,
          ],
        });
        await clickSend(page, sidebar(page));

        await viewEmailPage(page, ORDERS_DASHBOARD_NAME);

        const container = page.locator(".main-container");
        await expect(container.getByText("Bcc:", { exact: true })).toHaveCount(
          1,
        );
        await expect(
          container.getByText(USERS.admin.email, { exact: true }),
        ).toHaveCount(1);
        await expect(
          container.getByText(USERS.normal.email, { exact: true }),
        ).toHaveCount(1);
      });

      test("should send as CC when opted-in", async ({ page, mb }) => {
        // opt-in to CC
        await page.goto("/admin/settings/email");
        // Anchor on the write landing: upstream navigates away immediately
        // after and relied on Cypress's command-queue latency.
        // The setting key ends in "?", so it never survives a pathname
        // comparison intact — match the /api/setting/ prefix instead.
        const settingSaved = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.startsWith("/api/setting/"),
        );
        await page
          .getByTestId("bcc-enabled?-setting")
          .getByLabel("CC - Disclose recipients", { exact: true })
          .click();
        await settingSaved;

        await assignRecipients(page, mb.api, {
          firstNames: [
            USER_NAMES.admin.first_name,
            USER_NAMES.normal.first_name,
          ],
        });
        await clickSend(page, sidebar(page));

        await viewEmailPage(page, ORDERS_DASHBOARD_NAME);

        const container = page.locator(".main-container");
        await expect(container.getByText("Bcc:", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          container.getByText(USERS.admin.email, { exact: true }),
        ).toHaveCount(1);
        await expect(
          container.getByText(USERS.normal.email, { exact: true }),
        ).toHaveCount(1);
      });
    });

    test.describe("let non-users unsubscribe from subscriptions", () => {
      const nonUserEmail = "non-user@example.com";

      test("should allow non-user to unsubscribe from subscription", async ({
        page,
        mb,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

        await setupSubscriptionWithRecipients(page, [nonUserEmail]);

        await emailSubscriptionRecipients(page);

        await openEmailPage(page, ORDERS_DASHBOARD_NAME);

        const unsubscribed = page.waitForResponse((response) =>
          new URL(response.url()).pathname.startsWith("/api/pulse/unsubscribe"),
        );
        await page.getByText("Unsubscribe", { exact: true }).click();
        await unsubscribed;

        await expect(
          page.getByText(
            new RegExp(
              escapeRegExp(
                `You've unsubscribed ${nonUserEmail} from the "${ORDERS_DASHBOARD_NAME}" alert.`,
              ),
            ),
          ),
        ).toHaveCount(1);

        await openDashboardSubscriptions(page, mb.api);
        await openPulseSubscription(page);

        await expect(
          sidebar(page).getByText(nonUserEmail, { exact: true }),
        ).toHaveCount(0);
      });

      test("should allow non-user to undo-unsubscribe from subscription", async ({
        page,
        mb,
      }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

        await setupSubscriptionWithRecipients(page, [nonUserEmail]);

        await emailSubscriptionRecipients(page);

        await openEmailPage(page, ORDERS_DASHBOARD_NAME);

        const unsubscribed = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/pulse/unsubscribe",
        );
        await page.getByText("Unsubscribe", { exact: true }).click();
        await unsubscribed;

        await expect(
          page.getByText(
            new RegExp(
              escapeRegExp(
                `You've unsubscribed ${nonUserEmail} from the "${ORDERS_DASHBOARD_NAME}" alert.`,
              ),
            ),
          ),
        ).toHaveCount(1);

        const resubscribed = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/pulse/unsubscribe/undo",
        );
        await page.getByText("Undo", { exact: true }).click();
        await resubscribed;

        await expect(
          page.getByText(
            new RegExp(
              escapeRegExp(
                `Okay, ${nonUserEmail} is subscribed to the "${ORDERS_DASHBOARD_NAME}" alert again.`,
              ),
            ),
          ),
        ).toHaveCount(1);

        await openDashboardSubscriptions(page, mb.api);
        await openPulseSubscription(page);

        await expect(
          sidebar(page).getByText(nonUserEmail, { exact: true }),
        ).toHaveCount(1);
      });

      test("should show 404 page when missing required parameters", async ({
        page,
      }) => {
        // missing pulse-id
        await page.goto(
          `/unsubscribe?hash=459a8e9f8d9e&email=${encodeURIComponent(nonUserEmail)}`,
        );

        await expect(
          page.getByLabel("error page", { exact: true }),
        ).toHaveCount(1);
      });

      test("should show error message when server responds with an error", async ({
        page,
      }) => {
        // invalid pulse-id
        await page.goto(
          `/unsubscribe?hash=459a8e9f8d9e&email=${encodeURIComponent(nonUserEmail)}&pulse-id=f`,
        );

        await expect(
          page.getByLabel("error message", { exact: true }),
        ).toHaveCount(1);
      });
    });

    test("should persist attachments for dashboard subscriptions (metabase#14117)", async ({
      page,
      mb,
    }) => {
      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });

      const bar = sidebar(page);
      const attachResults = bar.getByLabel("Attach results", { exact: true });
      await expect(attachResults).not.toBeChecked();
      // Input is placed behind the label due to a tooltip in the label —
      // upstream force-clicks; dispatchEvent is the faithful equivalent.
      await attachResults.dispatchEvent("click");
      await bar.getByText("Questions to attach", { exact: true }).click();
      await clickButton(bar, "Done");

      await expect(
        bar.getByText("Subscriptions", { exact: true }),
      ).toHaveCount(1);
      await bar.getByText("Emailed hourly", { exact: true }).click();

      await bar
        .getByText("Delete this subscription", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        bar.getByText("Questions to attach", { exact: true }),
      ).toBeVisible();
      await expect(bar.getByLabel("Orders", { exact: true })).toBeChecked();
    });

    test("should localize schedule type in the delete-confirmation modal", async ({
      page,
      mb,
    }) => {
      await createEmailSubscription(page, mb.api, ADMIN_NAME);
      await expect(
        sidebar(page).getByText("Emailed hourly", { exact: true }),
      ).toBeVisible();

      const user = (await (
        await mb.api.get("/api/user/current")
      ).json()) as { id: number };
      await mb.api.put(`/api/user/${user.id}`, { locale: "en-ZZ" });
      await page.reload();

      await dashboardHeader(page)
        .getByLabel("[zz] Move, trash, and more…", { exact: true })
        .click();
      await popover(page)
        .getByText("[zz] Subscriptions", { exact: true })
        .click();
      await sidebar(page)
        .getByText(/\[zz\] hourly/)
        .first()
        .click();
      await sidebar(page)
        .getByText("[zz] Delete this subscription", { exact: true })
        .click();

      await expect(
        page
          .getByTestId("delete-confirmation-modal-pulse")
          .getByText("[zz] hourly", { exact: true }),
      ).toBeVisible();
    });

    test("should send only attachments without email content when 'Send only attachments' is enabled", async ({
      page,
      mb,
    }) => {
      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });

      const attachResults = page.getByLabel("Attach results", { exact: true });
      await expect(attachResults).not.toBeChecked();
      // Input is placed behind the label due to a tooltip in the label.
      await attachResults.dispatchEvent("click");
      await page.getByLabel("Questions to attach", { exact: true }).click();
      const sendOnly = page.getByLabel("Send only attachments", {
        exact: true,
      });
      await expect(sendOnly).not.toBeChecked();
      await sendOnly.dispatchEvent("click");
      await expect(sendOnly).toBeChecked();

      await sendEmailAndAssert(page, (email) => {
        expect(email.attachments ?? []).not.toHaveLength(0);
        const csvAttachment = (email.attachments ?? []).find(
          (attachment) => attachment.contentType === "text/csv",
        );
        expect(csvAttachment).toBeDefined();
        expect(csvAttachment!.fileName).toContain("Orders");
        expect(email.html).not.toContain("Orders chart");
        expect(email.html).toContain(
          "Dashboard content available in attached files",
        );
        expect(email.html).toContain("Orders in a dashboard");
      });
    });

    test("should not display 'null' day of the week (metabase#14405)", async ({
      page,
      mb,
    }) => {
      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
      await sidebar(page).getByText("To:", { exact: true }).click();

      // findByDisplayValue scoped to the sidebar — a page-wide scan resolves an
      // nth() index that goes stale when the page re-renders.
      await (await findByDisplayValue(sidebar(page), "Hourly")).click();
      await popover(page).getByText("Monthly", { exact: true }).click();

      await (await findByDisplayValue(sidebar(page), "First")).click();
      await popover(page).getByText("15th (Midpoint)", { exact: true }).click();

      await (
        await findByDisplayValue(sidebar(page), "15th (Midpoint)")
      ).click();
      await popover(page).getByText("First", { exact: true }).click();

      await clickButton(page, "Done");
      // Implicit assertion (word mustn't contain string "null")
      await expect(
        sidebar(page)
          .getByText(/^Emailed monthly on the first (?!null)/)
          .first(),
      ).toBeVisible();
    });

    test("should work when using dashboard default filter value on native query with required parameter (metabase#15705)", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await createNativeQuestion(mb.api, {
        name: "15705",
        native: {
          query: "SELECT COUNT(*) FROM ORDERS WHERE QUANTITY={{qty}}",
          "template-tags": {
            qty: {
              id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
              name: "qty",
              "display-name": "Qty",
              type: "number",
              required: true,
            },
          },
        },
      });

      const { id: dashboardId } = await createDashboard(mb.api, {
        name: "15705D",
      });

      // Add filter to the dashboard (old dashboard filter syntax)
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        parameters: [
          {
            name: "Quantity",
            slug: "quantity",
            id: "930e4001",
            type: "category",
            default: "3",
          },
        ],
      });

      // Add question to the dashboard
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboardId,
        card_id: questionId,
        card: {
          parameter_mappings: [
            {
              parameter_id: "930e4001",
              card_id: questionId,
              target: ["variable", ["template-tag", "qty"]],
            },
          ],
        },
      });

      await assignRecipient(page, mb.api, {
        userFullName: ADMIN_NAME,
        dashboardId,
      });

      // Click anywhere outside to close the popover
      await page.getByText("15705D", { exact: true }).first().click();
      await sendEmailAndAssert(page, (email) => {
        expect(email.html).not.toContain(
          "An error occurred while displaying this card.",
        );
        expect(email.html).toContain("2,738");
      });
    });

    test("should include text cards (metabase#15744)", async ({ page, mb }) => {
      const TEXT_CARD = "FooBar";

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await addTextBox(page, TEXT_CARD);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByText("You're editing this dashboard.", { exact: true }),
      ).toHaveCount(0);

      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
      // Click outside popover to close it and at the same time check that the
      // text card content is shown as expected
      await page.getByText(TEXT_CARD, { exact: true }).first().click();
      await sendEmailAndAssert(page, (email) => {
        expect(email.html).toContain(TEXT_CARD);
      });
    });

    test('should load question binned by "Month of year" or similar granularity (metabase#16918)', async ({
      page,
      mb,
    }) => {
      const questionDetails = {
        name: "16918",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month-of-year" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        display: "line",
      };

      const dashboardDetails = { name: "Repro Dashboard" };

      const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      await assignRecipient(page, mb.api, {
        userFullName: ADMIN_NAME,
        dashboardId: dashboard_id,
      });

      await sendEmailAndAssert(page, (email) => {
        expect(email.html).toContain(dashboardDetails.name);
        expect(email.html).toContain(questionDetails.name);
      });
    });

    test("renders a region (choropleth) map as an image in a subscription email", async ({
      page,
      mb,
    }) => {
      const questionDetails = {
        name: "Region map static-viz smoke",
        native: {
          query:
            "SELECT 'CA' AS state, 99999 AS metric " +
            "UNION ALL SELECT 'NY' AS state, 11111 AS metric",
        },
        display: "map",
        visualization_settings: {
          "map.type": "region",
          "map.region": "us_states",
          "map.dimension": "STATE",
          "map.metric": "METRIC",
        },
      };

      const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails,
      });
      await assignRecipient(page, mb.api, {
        userFullName: ADMIN_NAME,
        dashboardId,
      });

      // ⚠️ MEASURED (mutation testing, 3 independent input mutations, all
      // SURVIVED): none of the three assertions below discriminates the
      // behaviour the test names.
      //   - display "map" → "table": still green. The table formats the metric
      //     as "99,999", so `not.toContain("99999")` passes, and `<img` is
      //     satisfied by the email's own chrome images (probed: has<img=true,
      //     has99999=false, "has99,999"=true).
      //   - "map.region" → a nonexistent region: still green.
      //   - the native query replaced with `SELECT * FROM NO_SUCH_TABLE_XYZ`:
      //     still green — the email arrives carrying the card's name and no
      //     error text at all.
      // The error string is reachable in principle
      // (channel/render/body.clj:53), so this is "not triggered by any failure
      // mode I could induce here", not "structurally impossible". Ported
      // verbatim per the faithfulness rule rather than silently strengthened;
      // the upstream comment below states an inference its assertions cannot
      // actually check.
      await sendEmailAndAssert(page, ({ html }) => {
        expect(html).not.toContain(
          "An error occurred while displaying this card.",
        );
        // The map rasterizes to a PNG <img>; a table fallback would instead leak these values as text.
        expect(html).toContain("<img");
        expect(html).not.toContain("99999");
        expect(html).not.toContain("11111");
      });
    });
  });

  test.describe("with Slack set up", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mockSlackConfigured(page, mb.api);
    });

    test("should not enable 'Done' button before channel is selected (metabase#14494)", async ({
      page,
      mb,
    }) => {
      await openSlackCreationForm(page, mb.api);

      // findAllByRole(...).should("be.disabled") is an ANY-of-set assertion in
      // chai-jquery (porting rule 3) — assert on the first visible match.
      const doneButton = page
        .getByRole("button", { name: "Done", exact: true })
        .filter({ visible: true })
        .first();
      await expect(doneButton).toBeDisabled();

      await page
        .getByPlaceholder("Pick a user or channel...", { exact: true })
        .click();
      await page.getByText("#work", { exact: true }).click();
      await expect(doneButton).toBeEnabled();
    });

    test("should have 'Send to Slack now' button (metabase#14515)", async ({
      page,
      mb,
    }) => {
      await openSlackCreationForm(page, mb.api);

      const bar = sidebar(page);
      await expect(
        bar
          .getByRole("button", { name: "Send to Slack now", exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeDisabled();
      await bar
        .getByPlaceholder("Pick a user or channel...", { exact: true })
        .click();

      await popover(page).getByText("#work", { exact: true }).click();
      await expect(
        bar
          .getByRole("button", { name: "Done", exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeEnabled();
    });

    test("should allow non-admin users to create subscriptions", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openDashboardMenu(page);
      await expect(
        popover(page).getByText("Subscriptions", { exact: true }),
      ).toBeVisible();
    });

    test("should persist the immutable Slack channel_id alongside the channel name", async ({
      page,
      mb,
    }) => {
      await openSlackCreationForm(page, mb.api);

      await page
        .getByPlaceholder("Pick a user or channel...", { exact: true })
        .click();
      await popover(page).getByText("#work", { exact: true }).click();

      const createPulse = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/pulse",
      );
      await sidebar(page)
        .getByRole("button", { name: "Done", exact: true })
        .click();

      const body = (await createPulse).postDataJSON() as {
        channels: {
          channel_type: string;
          details: { channel?: string; channel_id?: string };
        }[];
      };
      // The mocked channel `#work` has id `C001` in e2e-slack-helpers.js.
      // Storing the immutable channel_id at save time is what makes the
      // subscription survive future channel renames in Slack.
      const slackChannel = body.channels.find(
        (channel) => channel.channel_type === "slack",
      );
      expect(slackChannel!.details.channel).toBe("#work");
      expect(slackChannel!.details.channel_id).toBe("C001");
    });
  });

  test.describe("OSS email subscriptions", () => {
    test.beforeEach(async ({ page, mb }) => {
      test.skip(
        !maildevUp,
        "@external: needs the maildev container (SMTP :1025, web :1080)",
      );
      await setupSMTP(mb.api);
      await gotoOrdersDashboard(page);
    });

    test("should include branding", async ({ page, mb }) => {
      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
      await sendEmailAndVisitIt(page);

      await expect(
        page
          .getByRole("link")
          .filter({ hasText: /Orders in a dashboard/ })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      const madeWith = page
        .getByRole("link")
        .filter({ hasText: /Made with/ })
        .first();
      await expect(madeWith).toContainText("Metabase");
      await expect(madeWith).toHaveAttribute(
        "href",
        "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=dashboard_subscription",
      );
    });

    test.describe("with parameters", () => {
      test.beforeEach(async ({ page }) => {
        await addParametersToDashboard(page);
      });

      test("should have a list of the default parameters applied to the subscription", async ({
        page,
        mb,
      }) => {
        await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });

        const subscriptionBar = () =>
          page
            .getByTestId("dashboard-parameters-and-cards")
            .locator("xpath=following-sibling::aside[1]");

        await expect(subscriptionBar()).toContainText("Text: Corbin Mertz");
        await clickButton(page, "Done");

        const pulseCard = page.locator("[aria-label='Pulse Card']");
        await expect(pulseCard).toContainText("Text: Corbin Mertz");
        await pulseCard.click();

        await sendEmailAndVisitIt(page);
        await assertEmailHeaderParameter(page, "Text", "Corbin Mertz");

        // change default text to sallie
        await gotoOrdersDashboard(page);
        await page.locator(".Icon-pencil").click();
        await page
          .getByTestId("edit-dashboard-parameters-widget-container")
          .getByText("Text", { exact: true })
          .click();
        await subscriptionBar()
          .getByText("Corbin Mertz", { exact: true })
          .click();

        await popover(page).getByText("Corbin Mertz", { exact: true }).click();
        await popover(page)
          .getByPlaceholder("Search the list", { exact: true })
          .pressSequentially("Sallie Flatley");
        await popover(page)
          .getByPlaceholder("Search the list", { exact: true })
          .press("Enter");
        await popover(page).getByText("Sallie Flatley", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Update filter", exact: true })
          .click();

        await page.getByRole("button", { name: "Save", exact: true }).click();

        // verify existing subscription shows new default in UI
        await openDashboardSubscriptions(page, mb.api);
        await page
          .locator("[aria-label='Pulse Card']")
          .getByText("Text: Sallie Flatley", { exact: true })
          .click();

        // verify existing subscription show new default in email
        await sendEmailAndVisitIt(page);
        await assertEmailHeaderParameter(page, "Text", "Sallie Flatley");
      });
    });
  });

  test.describe("EE email subscriptions", () => {
    test.beforeEach(async ({ page, mb }) => {
      test.skip(
        !maildevUp,
        "@external: needs the maildev container (SMTP :1025, web :1080)",
      );
      test.skip(
        !resolveToken("pro-self-hosted"),
        "needs the pro-self-hosted token",
      );
      await mb.api.activateToken("pro-self-hosted");
      await setupSMTP(mb.api);
      await gotoOrdersDashboard(page);
    });

    test("should not include branding", async ({ page, mb }) => {
      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
      await sendEmailAndVisitIt(page);

      await expect(
        page
          .getByRole("link")
          .filter({ hasText: /Orders in a dashboard/ })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("link").filter({ hasText: /Made with/ }),
      ).toHaveCount(0);
    });

    test("should only show current user in recipients dropdown if `user-visiblity` setting is `none`", async ({
      page,
      mb,
    }) => {
      await openRecipientsWithUserVisibilitySetting(page, mb, "none");

      await expect(popover(page).locator("span")).toHaveCount(1);
    });

    test("should only show users in same group in recipients dropdown if `user-visiblity` setting is `group`", async ({
      page,
      mb,
    }) => {
      await openRecipientsWithUserVisibilitySetting(page, mb, "group");

      await expect(popover(page).locator("span")).toHaveCount(5);
    });

    test("should show all users in recipients dropdown if `user-visiblity` setting is `all`", async ({
      page,
      mb,
    }) => {
      await openRecipientsWithUserVisibilitySetting(page, mb, "all");

      await expect(popover(page).locator("span")).toHaveCount(10);
    });

    test.describe("with no parameters", () => {
      test("should have no parameters section", async ({ page, mb }) => {
        await openDashboardSubscriptions(page, mb.api);

        await page.getByText("Email it", { exact: true }).click();

        // Anchor: the email form must have rendered before the absence check.
        await expect(recipientInput(page)).toBeVisible();
        await expect(
          page.getByText("Set filter values for when this gets sent", {
            exact: true,
          }),
        ).toHaveCount(0);
      });
    });

    test("should send a dashboard with questions saved in the dashboard", async ({
      page,
      mb,
    }) => {
      // Upstream also passes `database_id: SAMPLE_DATABASE.id`, but
      // cypress_sample_database.json has no `id` key — it is `undefined` there
      // too, and H.createQuestion derives the database from its own
      // `database` default. Dropped rather than transcribed as a no-op.
      await createQuestion(mb.api, {
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
      await sendEmailAndVisitIt(page);

      const container = page.locator(".container");
      await expect(
        container.getByText("Total Orders", { exact: true }).first(),
      ).toBeVisible();
      await expect(container.getByText("18,760", { exact: true })).toHaveCount(
        2,
      );
    });

    test.describe("with parameters", () => {
      test.beforeEach(async ({ page }) => {
        await addParametersToDashboard(page);
      });

      test("should show a filter description containing default values, even when not explicitly added to subscription", async ({
        page,
        mb,
      }) => {
        await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
        await clickButton(page, "Done");

        // verify defaults are listed correctly in UI
        await page
          .locator("[aria-label='Pulse Card']")
          .getByText("Text: Corbin Mertz", { exact: true })
          .click();

        // verify defaults are listed correctly in email
        await sendEmailAndVisitIt(page);
        await assertEmailHeaderParameter(page, "Text", "Corbin Mertz");

        // change default text to sallie
        await gotoOrdersDashboard(page);
        await page.locator(".Icon-pencil").click();
        await page
          .getByTestId("edit-dashboard-parameters-widget-container")
          .getByText("Text", { exact: true })
          .click();

        await page
          .getByTestId("dashboard-parameters-and-cards")
          .locator("xpath=following-sibling::aside[1]")
          .getByText("Corbin Mertz", { exact: true })
          .click();

        await popover(page).getByText("Corbin Mertz", { exact: true }).click();
        await popover(page)
          .getByPlaceholder("Search the list", { exact: true })
          .pressSequentially("Sallie Flatley");
        await popover(page)
          .getByPlaceholder("Search the list", { exact: true })
          .press("Enter");
        await popover(page).getByText("Sallie Flatley", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Update filter", exact: true })
          .click();
        await page.getByRole("button", { name: "Save", exact: true }).click();

        // verify existing subscription shows new default in UI
        await openDashboardSubscriptions(page, mb.api);
        await page
          .locator("[aria-label='Pulse Card']")
          .getByText("Text: Sallie Flatley", { exact: true })
          .click();

        // verify existing subscription show new default in email
        await sendEmailAndVisitIt(page);
        await assertEmailHeaderParameter(page, "Text", "Sallie Flatley");
      });

      test("should allow for setting parameters in subscription", async ({
        page,
        mb,
      }) => {
        await assignRecipient(page, mb.api, { userFullName: ADMIN_NAME });
        await clickButton(page, "Done");

        await page.getByText("Emailed hourly", { exact: true }).click();

        await page.getByText("Corbin Mertz", { exact: true }).last().click();
        // cy.type() clicks its subject first — pressSequentially alone leaves
        // the MultiAutocomplete's dropdown closed.
        const fieldValues = popover(page).getByRole("combobox").first();
        await fieldValues.click();
        await fieldValues.pressSequentially("Bob");
        await popover(page).getByText("Bobby Kessler", { exact: true }).click();
        // Submitting while a MultiAutocomplete/PillsInput holds focus silently
        // does nothing (the blur re-renders the form between mousedown and
        // mouseup) — blur first.
        await fieldValues.blur();
        await popover(page)
          .getByRole("button", { name: /Update filter/ })
          .first()
          .click();

        await page.getByText("Text 1", { exact: true }).last().click();
        await popover(page).getByText("Gizmo", { exact: true }).click();
        await popover(page)
          .getByText(/Add filter/)
          .first()
          .click();

        const pulsePut = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            /^\/api\/pulse\/\d+$/.test(new URL(response.url()).pathname),
        );
        await clickButton(page, "Done");
        await pulsePut;

        await page
          .getByTestId("dashboard-parameters-and-cards")
          .locator("xpath=following-sibling::aside[1]")
          .getByText("Text: 2 selections and 1 more filter", { exact: true })
          .click();

        await sendEmailAndVisitIt(page);
        const header = page.locator("table.header");
        await expect(
          header
            .getByText("Text", { exact: true })
            .locator("xpath=following-sibling::*[1]")
            .getByText("Corbin Mertz and Bobby Kessler", { exact: true }),
        ).toBeVisible();
        await expect(
          header
            .getByText("Text 1", { exact: true })
            .locator("xpath=following-sibling::*[1]")
            .getByText("Gizmo", { exact: true }),
        ).toBeVisible();
      });
    });

    test.describe("with unconnected parameters", () => {
      test("should show only connected parameters in subscription sidebar", async ({
        page,
        mb,
      }) => {
        await addConnectedAndUnconnectedParameterToDashboard(page);
        await openDashboardSubscriptions(page, mb.api, ORDERS_DASHBOARD_ID);

        await sidebar(page).getByText("Email it", { exact: true }).click();
        // Anchor before the absence check.
        await expect(recipientInput(page)).toBeVisible();
        await expect(
          sidebar(page).getByText("Text 1", { exact: true }),
        ).toHaveCount(0);
      });

      test("should not show filters section in subscription sidebar with no connected parameters", async ({
        page,
        mb,
      }) => {
        await editDashboard(page);
        await setTextFilter(page);
        // Upstream never saves: navigating away discards the unconnected filter.
        await openDashboardSubscriptions(page, mb.api, ORDERS_DASHBOARD_ID);

        await sidebar(page).getByText("Email it", { exact: true }).click();
        await expect(recipientInput(page)).toBeVisible();
        await expect(
          sidebar(page).getByText(
            "Set filter values for when this gets sent",
            { exact: true },
          ),
        ).toHaveCount(0);
      });
    });

    test.describe("modular embedding", () => {
      test("should not include links to Metabase", async ({ page, mb }) => {
        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

        await openSharingMenu(page);
        await sharingMenu(page)
          .getByRole("menuitem", { name: "Embed", exact: true })
          .click();
        await page
          .getByLabel("Metabase account (SSO)", { exact: true })
          .click();
        await embedModalEnableEmbedding(page);
        const allowSubscriptions = page.getByLabel("Allow subscriptions", {
          exact: true,
        });
        // A real force-click on this Mantine checkbox input reports
        // "clicking the checkbox did not change its state"; dispatching the
        // click at the input runs the activation behaviour and React's
        // onChange, which is also what Cypress's .check() does.
        await allowSubscriptions.dispatchEvent("click");
        await expect(allowSubscriptions).toBeChecked();

        const frame = getIframeBody(page);
        await frame.getByRole("button", { name: "Subscriptions" }).click();
        await sendEmailAndVisitIt(page, frame);

        // Links should be disabled in modular embedding and modular embedding
        // SDK subscription emails
        await expect(
          page
            .getByRole("table")
            .first()
            .getByText("Orders in a dashboard", { exact: true }),
        ).toHaveCount(1);
        await expect(page.getByRole("link")).toHaveCount(0);
      });
    });
  });
});

/**
 * Port of the repeated
 * `cy.get("table.header").first().within(() => {
 *    cy.findByText(label).next().findByText(value);
 *    cy.findByText("Text 1").should("not.exist"); })`
 */
async function assertEmailHeaderParameter(
  page: Page,
  label: string,
  value: string,
) {
  const header = page.locator("table.header").first();
  await expect(
    header
      .getByText(label, { exact: true })
      .locator("xpath=following-sibling::*[1]")
      .getByText(value, { exact: true }),
  ).toBeVisible();
  await expect(header.getByText("Text 1", { exact: true })).toHaveCount(0);
}
