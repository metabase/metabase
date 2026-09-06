/**
 * Helpers for the SSO > Google admin-settings spec
 * (port of e2e/test/scenarios/admin-2/sso/google.cy.spec.js).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/** The suffix every valid Google Sign-In client id must end with. */
export const CLIENT_ID_SUFFIX = "apps.googleusercontent.com";

/** Port of the spec-local getGoogleCard: cy.findByTestId("google-setting"). */
export function getGoogleCard(page: Page): Locator {
  return page.getByTestId("google-setting");
}

/**
 * Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
 * findByLabelText(label).clear().type(value).blur(). The label string is an
 * exact testing-library match, so getByLabel gets `{ exact: true }`.
 * `fill` clears then sets the value in one step and fires the input event
 * Formik's controlled FormTextInput listens on, marking the form dirty.
 */
export async function typeAndBlurUsingLabel(
  page: Page,
  label: string,
  value: string,
) {
  const field = page.getByLabel(label, { exact: true });
  await field.click();
  await field.fill(value);
  await field.blur();
}

/**
 * Port of the spec-local setupGoogleAuth: PUT /api/google/settings with the
 * test client-id fixture. The client id and domain here are the exact dummy
 * fixtures the Cypress spec uses — not real credentials.
 */
export async function setupGoogleAuth(
  api: MetabaseApi,
  { enabled = true }: { enabled?: boolean } = {},
) {
  await api.put("/api/google/settings", {
    "google-auth-enabled": enabled,
    "google-auth-client-id": `example.${CLIENT_ID_SUFFIX}`,
    "google-auth-auto-create-accounts-domain": "example.test",
  });
}
