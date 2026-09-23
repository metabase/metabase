/**
 * Per-spec helpers for the port of e2e/test/scenarios/sharing/alert/alert.cy.spec.js.
 *
 * Everything reusable already exists in shared modules and is imported
 * read-only by tests/alert.spec.ts (porting rule 9 — shared modules stay
 * untouched, so anything new lands here):
 * - `setupNotificationChannel` from support/metric-page.ts
 * - `addNotificationHandlerChannel` / `WEBHOOK_TEST_HOST` /
 *   `WEBHOOK_TEST_SESSION_ID` from support/question-saved.ts
 * - `setupSMTP` / `isMaildevRunning` / `notificationList` from
 *   support/onboarding-extras.ts
 * - `sharingMenuButton` from support/sharing.ts
 * - `openDashboardMenu` / `ORDERS_MODEL_ID` from support/organization.ts
 * - `icon` / `modal` / `popover` / `visitQuestion` / `visitDashboard` from
 *   support/ui.ts, `visitModel` from support/models.ts
 * - `sidebar` from support/dashboard.ts
 *
 * What lands here is the spec's own module-level helpers (addEmailRecipient,
 * setAllowedDomains) plus the webhook-tester availability probe.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { WEBHOOK_TEST_HOST, WEBHOOK_TEST_SESSION_ID } from "./question-saved";

type Scope = Page | FrameLocator | Locator;

/**
 * Availability probe for the `@external` webhook describe. Same shape as the
 * copy in tests/admin-settings.spec.ts (a live probe rather than an env flag,
 * so a stopped container gate-skips instead of failing).
 *
 * NOTE (see findings): this spec never actually causes the backend to POST to
 * the container — `POST /api/channel` only inserts the row, it does NOT call
 * `channel/can-connect?` (that is the separate `POST /api/channel/test`), and
 * the alert is created and deleted without ever firing. The upstream
 * `@external` tag on that describe is therefore over-broad. The gate is kept
 * anyway to mirror upstream's declared requirement.
 */
export async function isWebhookTesterRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
      { signal: AbortSignal.timeout(2_000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Port of the EE describe's spec-local `addEmailRecipient`:
 *
 *   cy.findByTestId("token-field")
 *     .findByRole("combobox")
 *     .click()
 *     .type(`${email}`)
 *     .blur();
 *
 * `scope` is the enclosing `H.modal()` / `H.sidebar()` that upstream is
 * `.within()` when it calls this — the helper does its own `findByTestId`
 * lookup, so the caller passes the container, not the token-field.
 *
 * NOTE — this shape changed under us. Until master 184c415f6e3 ("GDGT-2578
 * Replace TokenField") the recipient picker was the legacy `TokenField`, whose
 * inner control was a bare `<input>` (role `textbox`), and upstream reached it
 * with `cy.findAllByRole("textbox").first()`. It is now `MultiAutocomplete`
 * (Mantine `PillsInput` + `Combobox`), whose field carries `role="combobox"` —
 * so the old `getByRole("textbox")` matches nothing at all. That single
 * component swap is the root cause of every failure in this spec's EE
 * describe; the selector is now the one upstream itself moved to.
 *
 * Two things the literal shape would drop:
 * - `cy.type()` clicks its subject first, so the click is explicit here, and
 *   the characters go in with `pressSequentially` (not `fill`) because the
 *   combobox only tracks its search value through real keystrokes.
 * - Upstream sends NO `{enter}`: the free-form value is committed by the blur
 *   alone (`MultiAutocomplete` → `use-multi-autocomplete`'s blur handler runs
 *   `parseValue`). `blur()` on the resolved Cypress subject is reproduced by
 *   blurring the live `document.activeElement` — the picker drops its
 *   placeholder as soon as `recipients.length > 0`, so a locator captured
 *   before the commit can stop resolving mid-blur. This is also the
 *   MultiAutocomplete/PillsInput submit trap: the "Done" assertions that follow
 *   only mean something once focus has left the input.
 */
export async function addEmailRecipient(scope: Scope, email: string) {
  const input = scope.getByTestId("token-field").getByRole("combobox");
  await input.click();
  await input.pressSequentially(email);
  await input.page().evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
}

/** Port of the EE describe's spec-local `setAllowedDomains`. */
export async function setAllowedDomains(api: MetabaseApi, domain: string) {
  await api.updateSetting("subscription-allowed-domains", domain);
}
