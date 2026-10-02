import { USERS } from "e2e/support/cypress_data";

const { H } = cy;

const PATH = "/admin/metabot/mcp/authorizations";

/**
 * End-to-end coverage for the OAuth Authorizations admin page.
 *
 * Events are seeded through the *real* OAuth endpoints rather than stubbed, so this exercises the
 * full contract: the DCR registration write-path, the consent/decision write-path, and the admin
 * read endpoint the page consumes. `approved`/`denied` rendering paths are also covered by the
 * backend integration tests in `oauth_server/api_test.clj` and `oauth_server/api/admin_test.clj`.
 *
 * Note: `POST /oauth/register` is throttled per IP, so we deliberately seed only a handful of
 * events here. Pagination is covered by the page's unit test instead.
 */
describe("scenarios > admin > metabot > oauth authorizations", () => {
  beforeEach(() => {
    H.restore("default");
    cy.signInAsAdmin();
  });

  it("lists registration, approval, and denial events with client and user details", () => {
    H.registerOAuthClient("E2E MCP Client A");
    H.registerOAuthClient("E2E MCP Client B").then(H.approveOAuthClient);
    H.registerOAuthClient("E2E MCP Client C").then(H.denyOAuthClient);

    cy.visit(PATH);

    // Every client's registration row renders, and each decision event lands in the same row as
    // its client (and the deciding user). Client A's row also shows the registered redirect URI.
    assertEventRow("E2E MCP Client A", "Registered", H.OAUTH_REDIRECT_URI);
    assertEventRow("E2E MCP Client B", "Registered");
    assertEventRow("E2E MCP Client C", "Registered");
    assertEventRow("E2E MCP Client B", "Approved", USERS.admin.email);
    assertEventRow("E2E MCP Client C", "Denied", USERS.admin.email);
  });

  it("filters events by type via the API", () => {
    H.registerOAuthClient("E2E Filter Client").then(H.approveOAuthClient);

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
