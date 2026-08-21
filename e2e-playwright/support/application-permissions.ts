/**
 * Helpers for the application-permissions port
 * (e2e/test/scenarios/permissions/application-permissions.cy.spec.js).
 *
 * New helpers only (PORTING.md rule 9). Everything else is imported read-only:
 * - `modifyPermission` (full upstream signature) from support/admin-permissions.ts
 * - `saveChangesToPermissions` from support/command-palette.ts — the port of
 *   H.saveChangesToPermissions, which is byte-for-byte what this spec inlines
 *   (edit-bar "Save changes" → "Save permissions?" modal → "Yes" → PUT wait).
 * - `getProfileLink` / `goToAdmin` from support/command-palette.ts
 * - `createErroringQuestion` from support/admin-tools.ts — the port of
 *   `H.createNativeQuestion(details, { loadMetadata: true })` for a query that
 *   errors (plain `visitQuestion` hangs on its query_metadata wait).
 * - `configureSmtpSettings` from support/admin-extras.ts — see note below.
 * - `createQuestionAndDashboard` from support/factories.ts, `createPulse` from
 *   support/onboarding-extras.ts
 * - `openSharingMenu`/`sharingMenu`/`sharingMenuButton` from support/sharing.ts
 * - `openDashboardMenu` from support/organization.ts
 * - `sidebar` from support/download-permissions.ts
 * - `tableInteractive` from support/models.ts, `undoToast` from support/metrics.ts
 * - `main`/`modal`/`popover`/`visitDashboard`/`visitQuestion` from support/ui.ts
 * - `adminAppLinkText` from support/custom-viz.ts
 *
 * Only `createSubscription` and the permission-column indices are new.
 */
import type { Page, Locator } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createQuestionAndDashboard } from "./factories";
import { createPulse } from "./onboarding-extras";
import { SAMPLE_DATABASE } from "./sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Column indices in the application-permissions table
 * (Settings | Monitoring | Subscriptions).
 */
export const SETTINGS_INDEX = 0;
export const MONITORING_INDEX = 1;
export const SUBSCRIPTIONS_INDEX = 2;

/**
 * Port of the spec-local createSubscription(user_id): create a question on a
 * new dashboard and subscribe `user_id` to it by email, hourly.
 *
 * The Cypress version nests createPulse inside createQuestionAndDashboard's
 * `.then`, which keeps both requests on the same (admin) session — the
 * sequential awaits here do the same, since the harness API client is
 * explicitly authenticated.
 */
export async function createSubscription(api: MetabaseApi, userId: number) {
  const { dashboardId, cardId } = await createQuestionAndDashboard(api, {
    questionDetails: {
      name: "Test Question",
      query: {
        "source-table": ORDERS_ID,
      },
    },
  });

  await createPulse(api, {
    name: "Subscription",
    dashboard_id: dashboardId,
    cards: [
      {
        id: cardId,
        include_csv: false,
        include_xls: false,
      },
    ],
    channels: [
      {
        enabled: true,
        channel_type: "email",
        schedule_type: "hourly",
        recipients: [{ id: userId }],
      },
    ],
  });
}

/** cy.findByTestId("notifications-list"). */
export function notificationsList(page: Page): Locator {
  return page.getByTestId("notifications-list");
}
