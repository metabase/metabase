/**
 * Drives Metabase's embedded OAuth server through its public `/oauth` endpoints the way a real MCP client does:
 * dynamic registration, the consent page and its decision, and the authorization-code exchange. Specs use these
 * rather than seeding `oauth_client` rows so that what they assert is what a client can and cannot do.
 * `metabase.oauth-server.test-util` is the Clojure counterpart and the same flow.
 *
 * The `/oauth` throttlers count only attempts that throw, and these endpoints answer a bad request with an error
 * response instead, so a passing spec spends no budget — but seed a handful of clients at most, since an unexpected
 * 500 does count against the per-IP registration window.
 */

export const OAUTH_REDIRECT_URI = "https://example.com/callback";

/** An MCP baseline scope: what a real MCP client holds, reaching the tool surface and nothing else. */
const OAUTH_DEFAULT_SCOPE = "agent:content:read";

/**
 * The scope that makes a bearer token stand in for its user across the general REST API. A baseline-scope token is
 * refused there with a 403, which says nothing about whether the token is still live.
 */
export const OAUTH_FULL_ACCESS_SCOPE = "mb:full";

const OAUTH_STATE = "test-state";

/** The registration echoed back, plus the credentials that are readable only here. */
export type RegisteredOAuthClient = {
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  scope: string;
};

/**
 * Register a confidential client through `POST /oauth/register` (RFC 7591), recording a `registered` event.
 *
 * Confidential — `client_secret_basic` — so the client can complete the flow without PKCE, and so
 * {@link exchangeOAuthCode} has a secret to authenticate with. Pass `{ scope: OAUTH_FULL_ACCESS_SCOPE }` for a
 * client whose token has to reach the general REST API.
 */
export function registerOAuthClient(
  clientName: string,
  { scope = OAUTH_DEFAULT_SCOPE }: { scope?: string } = {},
): Cypress.Chainable<RegisteredOAuthClient> {
  return cy
    .request<RegisteredOAuthClient>("POST", "/oauth/register", {
      client_name: clientName,
      redirect_uris: [OAUTH_REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope,
      token_endpoint_auth_method: "client_secret_basic",
    })
    .then(({ body }) => body);
}

/**
 * Approve `client` as the signed-in user, granting every scope it registered for and recording an `approved` event.
 * Yields the authorization code, which {@link exchangeOAuthCode} turns into an access token.
 */
export function approveOAuthClient(
  client: RegisteredOAuthClient,
): Cypress.Chainable<string> {
  return decideOAuthConsent(client, true).then((location) => {
    const code = new URL(location).searchParams.get("code");
    if (code === null) {
      throw new Error(`No authorization code in the redirect to ${location}`);
    }
    return code;
  });
}

/** Deny `client` as the signed-in user, recording a `denied` event. Grants nothing, so there is no code. */
export function denyOAuthClient(
  client: RegisteredOAuthClient,
): Cypress.Chainable<void> {
  return decideOAuthConsent(client, false).then(() => undefined);
}

/**
 * Exchange `code` for an access token at `POST /oauth/token`, authenticating as `client` over HTTP Basic the way a
 * confidential client does. Yields the access token.
 */
export function exchangeOAuthCode(
  client: RegisteredOAuthClient,
  code: string,
): Cypress.Chainable<string> {
  return cy
    .request<{ access_token: string }>({
      method: "POST",
      url: "/oauth/token",
      form: true,
      headers: {
        Authorization: `Basic ${btoa(
          `${client.client_id}:${client.client_secret}`,
        )}`,
      },
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
      },
    })
    .then(({ body }) => body.access_token);
}

/** Approve `client` and exchange the code it yields, the whole authorization-code flow in one step. */
export function grantOAuthToken(
  client: RegisteredOAuthClient,
): Cypress.Chainable<string> {
  return approveOAuthClient(client).then((code) =>
    exchangeOAuthCode(client, code),
  );
}

/**
 * Drive the consent flow to a decision, as the real browser does: GET the consent page, lift the CSRF token and the
 * params signature out of its hidden fields, then POST the decision. Cypress carries the CSRF cookie the page set.
 * Yields the `Location` the decision redirects to, which both an approval and a denial have.
 */
function decideOAuthConsent(
  client: RegisteredOAuthClient,
  approved: boolean,
): Cypress.Chainable<string> {
  const authorizeUrl =
    "/oauth/authorize?" +
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: "code",
      scope: client.scope,
      state: OAUTH_STATE,
    }).toString();

  return cy
    .request<string>("GET", authorizeUrl)
    .then(({ body }) => {
      // What the page actually offered, not what the client registered for: the server decides what a request may
      // be granted, and a `granted_scope` naming anything it did not offer is refused as tampering.
      const offered = hiddenField(body, "scope");

      return cy.request({
        method: "POST",
        url: "/oauth/authorize/decision",
        followRedirect: false,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        // Encoded here rather than through Cypress's `form` option because `granted_scope` is the one field that
        // repeats: it carries the ticked boxes, one entry per scope, which Ring reads back as the vector the
        // endpoint expects. A single field holding "a b" would read as one unoffered scope and be refused.
        body: new URLSearchParams([
          ["approved", String(approved)],
          ["csrf_token", hiddenField(body, "csrf_token")],
          ["params_sig", hiddenField(body, "params_sig")],
          ["client_id", client.client_id],
          ["redirect_uri", OAUTH_REDIRECT_URI],
          ["response_type", "code"],
          ["scope", offered],
          ["state", OAUTH_STATE],
          // A denial grants nothing, so it ticks nothing.
          ...(approved
            ? offered
                .split(" ")
                .map((scope): [string, string] => ["granted_scope", scope])
            : []),
        ]).toString(),
      });
    })
    .then((response) => {
      expect(response.status, "consent decision redirects").to.eq(302);
      const { location } = response.headers;
      if (typeof location !== "string") {
        throw new Error("The consent decision did not redirect anywhere");
      }
      return location;
    });
}

/**
 * The `value` of the hidden form input named `name` on the consent page `html`. An empty value counts as missing:
 * posting a blank `csrf_token` or `params_sig` comes back as an opaque 403, so it fails here instead.
 */
function hiddenField(html: string, name: string): string {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  const value = tag?.[0].match(/value="([^"]+)"/);
  if (!value) {
    throw new Error(
      `Could not find hidden field "${name}" on the consent page`,
    );
  }
  return value[1];
}
