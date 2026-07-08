import { USERS } from "e2e/support/cypress_data";

const { H } = cy;

const PATH = "/admin/metabot/mcp/authorizations";
const REDIRECT_URI = "https://example.com/callback";

/**
 * End-to-end coverage for the OAuth Authorizations admin page.
 *
 * Events are seeded through the *real* OAuth endpoints rather than stubbed, so this exercises the
 * full contract: the DCR registration write-path, the consent/decision write-path, and the admin
 * read endpoint the page consumes. `approved`/`denied` rendering paths are also covered by the
 * backend integration tests in `oauth_server/api_test.clj` and `oauth_server/api/admin_test.clj`.
 *
 * Note: `POST /oauth/register` is throttled to 10/min/IP, so we deliberately seed only a handful of
 * events here. Pagination is covered by the page's unit test instead.
 */
describe("scenarios > admin > metabot > oauth authorizations", () => {
  beforeEach(() => {
    H.restore("default");
    cy.signInAsAdmin();
  });

  it("lists registration, approval, and denial events with client and user details", () => {
    registerClient("E2E MCP Client A");
    registerClient("E2E MCP Client B", {
      token_endpoint_auth_method: "client_secret_basic",
    }).then(approveClient);
    registerClient("E2E MCP Client C", {
      token_endpoint_auth_method: "client_secret_basic",
    }).then(denyClient);

    cy.visit(PATH);

    // Every client's registration row renders, and each decision event lands in the same row as
    // its client (and the deciding user). Client A's row also shows the registered redirect URI.
    assertEventRow("E2E MCP Client A", "Registered", REDIRECT_URI);
    assertEventRow("E2E MCP Client B", "Registered");
    assertEventRow("E2E MCP Client C", "Registered");
    assertEventRow("E2E MCP Client B", "Approved", USERS.admin.email);
    assertEventRow("E2E MCP Client C", "Denied", USERS.admin.email);
  });

  it("filters events by type via the API", () => {
    registerClient("E2E Filter Client", {
      token_endpoint_auth_method: "client_secret_basic",
    }).then(approveClient);

    cy.intercept("GET", "/api/oauth/authorizations*").as("list");
    cy.visit(PATH);
    cy.wait("@list");

    cy.findByLabelText("Filter by event").click();
    cy.findByRole("option", { name: "Approved" }).click();

    cy.wait("@list")
      .its("request.url")
      .should("include", "event-type=approved");

    cy.findByTestId("oauth-authorizations-table").within(() => {
      cy.findByText("Approved").should("be.visible");
      cy.findByText("Registered").should("not.exist");
    });
  });

  it("is accessible to superusers only", () => {
    cy.signInAsNormalUser();
    cy.request({
      method: "GET",
      url: "/api/oauth/authorizations",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });
});

type RegisteredClient = { client_id: string };

/**
 * Register a dynamic client via `POST /oauth/register`, creating a `registered` audit event.
 * `extra` merges into the registration body — pass
 * `{ token_endpoint_auth_method: "client_secret_basic" }` for a confidential client that can
 * complete the consent flow without PKCE. Yields the registration response.
 */
function registerClient(
  clientName: string,
  extra: Record<string, unknown> = {},
) {
  return cy
    .request("POST", "/oauth/register", {
      client_name: clientName,
      redirect_uris: [REDIRECT_URI],
      ...extra,
    })
    .then(({ body }) => body as RegisteredClient);
}

function approveClient(client: RegisteredClient) {
  return decideClient(client, true);
}

function denyClient(client: RegisteredClient) {
  return decideClient(client, false);
}

/**
 * Drive the consent flow to a decision for a registered client, recording an `approved` or `denied`
 * event stamped with the signed-in user. `scope` is omitted (it's optional, and the DCR client's
 * agent scopes don't include `profile`); the client must be confidential so the public-client PKCE
 * requirement doesn't apply. Mirrors the real browser flow: GET the consent page, lift the CSRF
 * token + params signature from its hidden fields, then POST the decision (Cypress carries the
 * CSRF cookie). Both approve and deny redirect (302).
 */
function decideClient(client: RegisteredClient, approved: boolean) {
  const clientId = client.client_id;
  const authorizeUrl =
    `/oauth/authorize?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&response_type=code&state=test-state";

  return cy.request("GET", authorizeUrl).then(({ body }) => {
    cy.request({
      method: "POST",
      url: "/oauth/authorize/decision",
      form: true,
      followRedirect: false,
      body: {
        approved: String(approved),
        csrf_token: extractHiddenField(body, "csrf_token"),
        params_sig: extractHiddenField(body, "params_sig"),
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        state: "test-state",
      },
    })
      .its("status")
      .should("eq", 302);
  });
}

/**
 * Assert exactly one table row contains all of the given texts together — ties a specific event
 * (and the deciding user) to the expected client's row rather than checking page-wide counts.
 */
function assertEventRow(...texts: string[]) {
  cy.findByTestId("oauth-authorizations-table")
    .findAllByRole("row")
    .then(($rows) => {
      const matching = $rows.filter((_index, el) =>
        texts.every((text) => el.textContent?.includes(text)),
      );
      expect(matching, `row matching ${texts.join(" / ")}`).to.have.length(1);
    });
}

/** Pull the `value` of a hidden form input by `name` out of the consent page HTML. */
function extractHiddenField(html: string, name: string): string {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  const value = tag?.[0].match(/value="([^"]+)"/);
  if (!value) {
    throw new Error(
      `Could not find hidden field "${name}" in the consent page`,
    );
  }
  return value[1];
}
