/**
 * Helpers for the onboarding SSO spec
 * (port of e2e/test/scenarios/onboarding/auth/sso.cy.spec.js).
 *
 * Deliberately thin: the login-form driver (`submitLoginForm`) already lives in
 * support/signin.ts and the `/api/user/current` stub (the port of
 * H.mockCurrentUserProperty) already lives in support/user-settings.ts as
 * `stubCurrentUser`. Both are imported by the spec rather than re-implemented.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/**
 * Port of the spec's beforeEach block: set a fake Google client ID and enable
 * Google auth. The client id is the dummy fixture the Cypress spec uses — the
 * suffix is all the backend validates, so no real Google credentials or
 * round-trip are involved.
 */
export async function setupFakeGoogleAuth(api: MetabaseApi) {
  await api.put("/api/google/settings", {
    "google-auth-client-id": "fake-client-id.apps.googleusercontent.com",
    "google-auth-enabled": true,
  });
}

/**
 * The "Sign in with email" link on the SSO card screen (PasswordButton renders
 * an AuthTextLink). `cy.findByText("Sign in with email")` is a testing-library
 * exact match → `{ exact: true }` (PORTING rule 1).
 */
export function signInWithEmailLink(page: Page): Locator {
  return page.getByText("Sign in with email", { exact: true });
}
