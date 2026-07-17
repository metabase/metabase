/**
 * Helpers for the wave 7 filter/admin spec ports — OAuth event seeding for
 * the oauth-authorizations spec, ported from the cy.request-based helpers in
 * e2e/test/scenarios/admin/oauth-authorizations.cy.spec.ts. Lives in its own
 * file so the shared support modules stay untouched.
 *
 * All helpers take the browser context's APIRequestContext (`page.request`),
 * NOT the standalone `request` fixture: the consent flow authenticates via
 * the `metabase.SESSION` cookie that `mb.signIn*` sets on the browser
 * context, and the CSRF cookie set by the consent-page GET must ride along
 * on the decision POST — exactly the cookie jar cy.request shared.
 */
import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export const OAUTH_REDIRECT_URI = "https://example.com/callback";

export type RegisteredOauthClient = { client_id: string };

/**
 * Register a dynamic client via `POST /oauth/register`, creating a
 * `registered` audit event. `extra` merges into the registration body — pass
 * `{ token_endpoint_auth_method: "client_secret_basic" }` for a confidential
 * client that can complete the consent flow without PKCE.
 */
export async function registerOauthClient(
  request: APIRequestContext,
  clientName: string,
  extra: Record<string, unknown> = {},
): Promise<RegisteredOauthClient> {
  const response = await request.post("/oauth/register", {
    data: {
      client_name: clientName,
      redirect_uris: [OAUTH_REDIRECT_URI],
      ...extra,
    },
  });
  expect(
    response.ok(),
    `POST /oauth/register -> ${response.status()}`,
  ).toBeTruthy();
  return (await response.json()) as RegisteredOauthClient;
}

export function approveOauthClient(
  request: APIRequestContext,
  client: RegisteredOauthClient,
) {
  return decideOauthClient(request, client, true);
}

export function denyOauthClient(
  request: APIRequestContext,
  client: RegisteredOauthClient,
) {
  return decideOauthClient(request, client, false);
}

/**
 * Drive the consent flow to a decision for a registered client, recording an
 * `approved` or `denied` event stamped with the signed-in user. `scope` is
 * omitted (it's optional, and the DCR client's agent scopes don't include
 * `profile`); the client must be confidential so the public-client PKCE
 * requirement doesn't apply. Mirrors the real browser flow: GET the consent
 * page, lift the CSRF token + params signature from its hidden fields, then
 * POST the decision. Both approve and deny redirect (302), so the POST must
 * not follow redirects — the target is an external callback URL.
 */
async function decideOauthClient(
  request: APIRequestContext,
  client: RegisteredOauthClient,
  approved: boolean,
) {
  const authorizeUrl =
    `/oauth/authorize?client_id=${client.client_id}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    "&response_type=code&state=test-state";

  const consentResponse = await request.get(authorizeUrl);
  expect(
    consentResponse.ok(),
    `GET ${authorizeUrl} -> ${consentResponse.status()}`,
  ).toBeTruthy();
  const consentHtml = await consentResponse.text();

  const decisionResponse = await request.post("/oauth/authorize/decision", {
    form: {
      approved: String(approved),
      csrf_token: extractHiddenField(consentHtml, "csrf_token"),
      params_sig: extractHiddenField(consentHtml, "params_sig"),
      client_id: client.client_id,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: "code",
      state: "test-state",
    },
    maxRedirects: 0,
  });
  expect(
    decisionResponse.status(),
    `POST /oauth/authorize/decision (approved=${approved}) should redirect`,
  ).toBe(302);
}

/** Pull the `value` of a hidden form input by `name` out of the consent page HTML. */
function extractHiddenField(html: string, name: string): string {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  const value = tag?.[0].match(/value="([^"]+)"/);
  if (!value) {
    throw new Error(`Could not find hidden field "${name}" in the consent page`);
  }
  return value[1];
}

/**
 * Case-sensitive substring matcher for `filter({ hasText })` — Cypress-style
 * `textContent.includes(text)` semantics (PORTING.md rule 1).
 */
export function caseSensitiveSubstring(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
