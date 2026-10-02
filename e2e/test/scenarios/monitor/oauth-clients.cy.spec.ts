import { USERS } from "e2e/support/cypress_data";

const { H } = cy;

const PATH = "/monitor/oauth-clients";
const CLIENT_NAME = "E2E Revocable Client";
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

/**
 * End-to-end coverage for Monitor > OAuth clients, the page an admin revokes a client from.
 *
 * The client is seeded through the *real* `/oauth` endpoints — registered, approved, and its code exchanged for a
 * token — so the counts the page shows are counts of a token that actually exists, and the revoke is watched at the
 * only place that settles it: the token stops working. The page's own filtering, sorting, paging and copy are
 * covered far more cheaply by `OAuthClientsPage.unit.spec.tsx`.
 */
describe("scenarios > monitor > oauth clients", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("revokes a client from the page and cuts off the token it issued", () => {
    // The all-features token rather than the pro one the AI-auditing scenarios next door activate: no licence token
    // issued to the suite today carries `session-management`, and this is the superset, so it is the one that will
    // carry it first once they refresh.
    H.activateToken("bleeding-edge");

    // Full access, not the MCP baseline scope a real client asks for: the scenario has to watch the token work and
    // then stop, and the clearest thing a token can be watched doing is standing in for its user on the general
    // REST API. That is the same observation the backend tests make of a revoke.
    H.registerOAuthClient(CLIENT_NAME, {
      scope: H.OAUTH_FULL_ACCESS_SCOPE,
    }).then((client) => {
      cy.wrap(client.client_id, { log: false }).as("clientId");
      H.grantOAuthToken(client).then((accessToken) =>
        cy.wrap(accessToken, { log: false }).as("accessToken"),
      );
    });

    cy.log("The token the client obtained acts as the user who approved it");
    cy.get<string>("@accessToken").then((accessToken) => {
      requestCurrentUserWithBearerOnly(accessToken).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.email).to.eq(USERS.admin.email);
      });
    });
    cy.signInAsAdmin();

    cy.log("An admin reaches the page from the Monitor nav");
    cy.visit("/monitor");
    cy.findByTestId("monitor-nav")
      .findByRole("link", { name: "OAuth clients" })
      .click();
    cy.location("pathname").should("eq", PATH);

    cy.log("The client is listed with the one user and one live token it has");
    cy.get<string>("@clientId").then((clientId) => {
      clientRow(clientId)
        .should("contain", CLIENT_NAME)
        .and("contain", clientId);

      // The Active tab's columns are Client, Redirect URIs, Users, Live tokens, Registered, one gridcell each, and
      // the counts render as bare numbers with nothing to anchor on but their position. The length assertion is
      // what keeps the two indices below honest if the columns ever change.
      clientRow(clientId)
        .findAllByRole("gridcell")
        .should("have.length", 5)
        .then(($cells) => {
          expect($cells.eq(2).text().trim(), "Users").to.eq("1");
          expect($cells.eq(3).text().trim(), "Live tokens").to.eq("1");
        });

      clientRow(clientId).click();
      cy.location("pathname").should("eq", `${PATH}/${clientId}`);
    });

    cy.log(
      "The sidebar names who connected it, its live token, and its history",
    );
    cy.findByTestId("oauth-client-detail-sidebar").within(() => {
      cy.findByTestId("oauth-client-users")
        .should("contain", ADMIN_NAME)
        .and("contain", "1 live token");
      cy.findByTestId("oauth-client-activity")
        .should("contain", "Registered")
        .and("contain", "Approved")
        .and("contain", USERS.admin.email);
      cy.button("Revoke client").click();
    });

    cy.findByTestId("confirm-modal").within(() => {
      cy.findByText("Revoke this client?").should("be.visible");
      cy.button("Revoke").click();
    });

    cy.log("The revoke is reported, and the Active tab has nothing left");
    H.undoToast().should("contain", "Revoked 1 client");
    cy.findByTestId("oauth-clients-table").should(
      "contain",
      "No active clients",
    );
    cy.findByTestId("oauth-client-detail-sidebar").should("not.exist");

    cy.log("The Revoked tab keeps it on record, with the admin who revoked it");
    // A pattern, not the exact name: each tab's icon carries an aria-label, so the accessible name reads
    // "history icon Revoked".
    cy.findByRole("tab", { name: /Revoked/ }).click();
    cy.get<string>("@clientId").then((clientId) => {
      clientRow(clientId)
        .should("contain", CLIENT_NAME)
        .and("contain", ADMIN_NAME);
    });

    cy.log("The token it issued no longer authenticates");
    cy.get<string>("@accessToken").then((accessToken) => {
      requestCurrentUserWithBearerOnly(accessToken)
        .its("status")
        .should("eq", 401);
    });
  });

  it("gates the nav item and the page without the session-management feature", () => {
    cy.visit(PATH);

    cy.log("The nav item is there, marked as an upsell");
    cy.findByTestId("monitor-nav")
      .findByRole("link", { name: "OAuth clients" })
      .should("be.visible")
      .findByTestId("upsell-gem")
      .should("be.visible");

    cy.log("The page upsells rather than listing anyone's clients");
    // The route stays on the page and serves the upsell, rather than turning the admin away to /unauthorized
    cy.location("pathname").should("eq", PATH);
    cy.findByTestId("monitor-main")
      .findByText("See which programs can act as your users, and cut one off")
      .should("be.visible");
    cy.findByTestId("oauth-clients-table").should("not.exist");
  });
});

const clientRow = (clientId: string) =>
  cy.findByTestId(`oauth-client-row-${clientId}`);

/**
 * Sign the test out, then `GET /api/user/current` with `accessToken` as the only credential.
 *
 * Clearing the cookies is the point, not a detail: the server prefers a session over a bearer, so with the admin's
 * cookie still set this request would answer 200 whether or not the token is any good. The test is left signed out —
 * sign back in before touching the UI again.
 */
function requestCurrentUserWithBearerOnly(accessToken: string) {
  cy.clearCookies();
  return cy.request<{ email: string }>({
    method: "GET",
    url: "/api/user/current",
    headers: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: false,
  });
}
