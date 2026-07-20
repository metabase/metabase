/**
 * Helpers for the SSO > JWT admin-settings spec
 * (port of e2e/test/scenarios/admin-2/sso/jwt.cy.spec.js).
 *
 * Deliberately thin. Everything this spec shares with the SAML spec already
 * exists:
 *   - the group-mappings widget driver (a port of the shared
 *     e2e/test/scenarios/admin-2/sso/shared/group-mappings-widget.js, which
 *     upstream parameterises by auth method) lives in support/sso-saml.ts and
 *     is imported with method "jwt";
 *   - `typeAndBlurUsingLabel` / `goToAuthOverviewPage` likewise.
 *   - `enableJwtAuth` (port of e2e-jwt-helpers.ts) lives in support/sdk-iframe.ts.
 *
 * CONSOLIDATION: the SSO-settings surface is now spread over sso-saml.ts,
 * sdk-iframe.ts and this file. A shared `support/sso.ts` holding the
 * group-mappings driver + the auth-overview/label helpers is the obvious next
 * pass; it was not done here because sso-saml.ts was being edited concurrently
 * by another agent.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Port of the spec-local getJwtCard:
 *   findByTestId("admin-layout-content").findByText("JWT").parent().parent()
 *
 * The "JWT" CardTitle sits in CardHeader, which sits in CardRoot — and
 * CardRoot carries data-testid="jwt-setting" (AuthCard.tsx:127,
 * `data-testid={`${type}-setting`}` with type="jwt" from JwtAuthCard.tsx).
 * Same single element, without the brittle parent-walk.
 */
export function getJwtCard(page: Page): Locator {
  return page.getByTestId("jwt-setting");
}

/** The `@updateSettings` alias: PUT /api/setting (the bulk endpoint). */
export function waitForUpdateSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/setting",
  );
}

/** The `@updateSetting` alias: PUT /api/setting/<key> (the single-key endpoint). */
export function waitForUpdateSetting(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/setting/"),
  );
}
