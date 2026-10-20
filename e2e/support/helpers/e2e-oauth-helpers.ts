// Drives the real `/oauth` endpoints the way an MCP client does. Registration is throttled per IP, so seed a
// handful of clients at most.

export const OAUTH_REDIRECT_URI = "https://example.com/callback";

const OAUTH_DEFAULT_SCOPE = "agent:content:read";

/** Lets a token act as its user on the REST API, where a baseline-scope token gets a 403 whether live or not. */
export const OAUTH_FULL_ACCESS_SCOPE = "mb:full";

const OAUTH_STATE = "test-state";

export type RegisteredOAuthClient = {
  client_id: string;
  client_secret: string;
  registration_access_token: string;
  scope: string;
};

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
      // confidential, so the flow can complete without PKCE
      token_endpoint_auth_method: "client_secret_basic",
    })
    .then(({ body }) => body);
}

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

export function denyOAuthClient(
  client: RegisteredOAuthClient,
): Cypress.Chainable<void> {
  return decideOAuthConsent(client, false).then(() => undefined);
}

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

export function grantOAuthToken(
  client: RegisteredOAuthClient,
): Cypress.Chainable<string> {
  return approveOAuthClient(client).then((code) =>
    exchangeOAuthCode(client, code),
  );
}

// GET the consent page for its CSRF token and params signature (Cypress keeps its CSRF cookie), then POST the decision
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
      // what the page offered, not what was registered: granting anything unoffered is refused as tampering
      const offered = hiddenField(body, "scope");

      return cy.request({
        method: "POST",
        url: "/oauth/authorize/decision",
        followRedirect: false,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        // not Cypress's `form` option: `granted_scope` must repeat once per scope for Ring to read it as a vector
        body: new URLSearchParams([
          ["approved", String(approved)],
          ["csrf_token", hiddenField(body, "csrf_token")],
          ["params_sig", hiddenField(body, "params_sig")],
          ["client_id", client.client_id],
          ["redirect_uri", OAUTH_REDIRECT_URI],
          ["response_type", "code"],
          ["scope", offered],
          ["state", OAUTH_STATE],
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

// Throws on an empty value too: posting a blank `csrf_token` or `params_sig` fails as an opaque 403
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
