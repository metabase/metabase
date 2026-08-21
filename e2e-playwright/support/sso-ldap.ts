/**
 * Helpers for the SSO > LDAP admin-settings spec
 * (port of e2e/test/scenarios/admin-2/sso/ldap.cy.spec.js).
 *
 * Deliberately thin. Everything shared with the SAML/JWT specs already exists:
 *   - the group-mappings widget driver (port of the shared
 *     e2e/test/scenarios/admin-2/sso/shared/group-mappings-widget.js, which
 *     upstream parameterises by auth method) lives in support/sso-saml.ts and
 *     is imported here with method "ldap";
 *   - `typeAndBlurUsingLabel` / `goToAuthOverviewPage` likewise;
 *   - the `@updateSetting` / `@updateSettings` response waiters live in
 *     support/sso-jwt.ts and are re-used rather than re-implemented.
 *
 * CONSOLIDATION (unchanged from the JWT port's note): the SSO-settings surface
 * is now spread over sso-saml.ts, sso-jwt.ts, sdk-iframe.ts and this file. A
 * shared `support/sso.ts` remains the obvious next pass; not done here because
 * this port must not edit shared modules.
 */
import net from "node:net";

import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Port of the spec-local getLdapCard:
 *   findByTestId("admin-layout-content").findByText("LDAP").parent().parent()
 *
 * The "LDAP" CardTitle sits in CardHeader, which sits in CardRoot — and
 * CardRoot carries data-testid="ldap-setting" (AuthCard.tsx,
 * `data-testid={`${type}-setting`}`). Same single element, without the brittle
 * parent-walk. (Already relied on by tests/admin-authentication.spec.ts.)
 */
export function getLdapCard(page: Page): Locator {
  return page.getByTestId("ldap-setting");
}

/** The `@updateLdapSettings` alias: PUT /api/ldap/settings. */
export function waitForUpdateLdapSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/ldap/settings",
  );
}

/**
 * Fixture credentials for the local OpenLDAP container.
 *
 * These are NOT secrets: they are the values the container is booted with, and
 * they are already committed in plaintext to this repo in
 * `e2e/test/scenarios/docker-compose.yml` (service `ldap`). Upstream's
 * e2e-ldap-helpers.js inlines them too. Env vars are honoured first so a
 * differently-provisioned server can be pointed at without editing source.
 *
 * The rule they sit under is "don't leak real secrets into logs and findings
 * files" — so these never get printed, and the findings file refers to them by
 * location rather than value.
 */
export const LDAP_BIND_PASSWORD =
  process.env.MB_E2E_LDAP_BIND_PASSWORD ?? "adminpass";
export const LDAP_USER_PASSWORD =
  process.env.MB_E2E_LDAP_USER_PASSWORD ?? "123456";

/** The fixture account the container provisions (a username, not a secret). */
export const LDAP_USERNAME = "user01@example.org";

const LDAP_HOST = "localhost";
const LDAP_PORT = 389;

/**
 * Port of the "make sure the ldap test server is running" precondition that
 * upstream states only as a comment in e2e-ldap-helpers.js.
 *
 * This is a real gate, not a convenience: PUT /api/ldap/settings runs
 * `ldap/test-ldap-connection` server-side and returns HTTP 500
 * (`{"errors":{"ldap-host":"Wrong host or port", ...}}`) unless the bind
 * succeeds — so `setupLdap` cannot be made to work against a missing server.
 *
 * Memoised: one TCP connect per worker process.
 */
let reachability: Promise<boolean> | undefined;

export function ldapReachable(): Promise<boolean> {
  reachability ??= new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(LDAP_PORT, LDAP_HOST);
  });
  return reachability;
}

/** Undefined when the LDAP-dependent tests can run; otherwise the skip reason. */
export async function ldapUnavailableReason(): Promise<string | undefined> {
  if (!(await ldapReachable())) {
    return `no LDAP server on ${LDAP_HOST}:${LDAP_PORT} — start it with \`docker compose up ldap -d\` in e2e/test/scenarios`;
  }
  return undefined;
}

type LdapApi = {
  put(
    path: string,
    body: unknown,
    options?: { failOnStatusCode?: boolean },
  ): Promise<unknown>;
};

/**
 * Port of H.setupLdap (e2e/support/helpers/e2e-ldap-helpers.js).
 *
 * Note this is NOT a pure settings write — the endpoint bind-tests the config
 * and refuses to persist anything on failure, so every upstream test that
 * calls it is hard-blocked without a live server.
 */
export async function setupLdap(api: LdapApi) {
  await api.put("/api/ldap/settings", {
    "ldap-enabled": true,
    "ldap-host": LDAP_HOST,
    "ldap-port": String(LDAP_PORT),
    "ldap-bind-dn": "cn=admin,dc=example,dc=org",
    "ldap-password": LDAP_BIND_PASSWORD,
    "ldap-user-base": "ou=users,dc=example,dc=org",
    "ldap-attribute-email": "uid",
    "ldap-attribute-firstname": "sn",
    "ldap-attribute-lastname": "sn",
  });
}

/**
 * Playwright has no `getByDisplayValue`, and a `[value="..."]` locator is not a
 * substitute: React keeps the `value` *attribute* out of sync with the live
 * `.value` *property*, so a typed-then-cleared input still matches the
 * attribute. This reads the live property off every field in scope and returns
 * how many currently hold `value`.
 *
 * Returns an `expect.poll` assertion so it retries like a normal Playwright
 * assertion (upstream's `findByDisplayValue(...).should("exist")` retries too).
 */
export function expectDisplayValueCount(scope: Page | Locator, value: string) {
  return expect
    .poll(
      async () =>
        (
          await scope
            .locator("input, textarea, select")
            .evaluateAll((els) =>
              els.map((el) => (el as HTMLInputElement).value),
            )
        ).filter((v) => v === value).length,
      { message: `fields with display value "${value}"` },
    );
}

/** Port of the spec-local enterLdapPort. */
export async function enterLdapPort(page: Page, value: string) {
  await typeAndBlur(page, /LDAP Port/i, value);
}

/** Port of the spec-local enterLdapSettings. */
export async function enterLdapSettings(page: Page) {
  await typeAndBlur(page, /LDAP Host/i, LDAP_HOST);
  await typeAndBlur(page, /LDAP Port/i, String(LDAP_PORT));
  await typeAndBlur(page, "Username or DN", "cn=admin,dc=example,dc=org");
  await typeAndBlur(page, "Password", LDAP_BIND_PASSWORD);
  await typeAndBlur(page, /User search base/i, "ou=users,dc=example,dc=org");
}

/**
 * Local copy of H.typeAndBlurUsingLabel rather than the sso-saml export,
 * because the LDAP port field is `type="number"` and Formik-validated: `fill`
 * on it can leave the form's `dirty` flag unset for the whitespace case
 * ("389 " in the #13313 test), where upstream relies on a real keystroke
 * sequence. click + pressSequentially + blur reproduces the Cypress
 * `.clear().type(value).blur()` semantics for both text and number inputs.
 */
async function typeAndBlur(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label);
  await field.click();
  await field.clear();
  await field.pressSequentially(value);
  await field.blur();
}
