import { USERS } from "e2e/support/cypress_data";

const { H } = cy;

const PATH = "/monitor/oauth-clients";
const CLIENT_NAME = "E2E Revocable Client";
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

describe("scenarios > monitor > oauth client management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("revokes a client from the page and cuts off the token it issued", () => {
    // no other suite token carries `session-management` yet
    H.activateToken("bleeding-edge");

    // full access, so the token can be watched working and then failing on the REST API
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
    // not `/monitor`: its two-hop redirect can land after the click below and replace it
    cy.visit("/monitor/logs");
    cy.findByTestId("monitor-nav")
      .findByRole("link", { name: "OAuth clients" })
      .click();
    cy.location("pathname").should("eq", PATH);

    cy.log("The client is listed with the one user and one live token it has");
    cy.get<string>("@clientId").then((clientId) => {
      clientRow(clientId)
        .should("contain", CLIENT_NAME)
        .and("contain", clientId);

      // the counts can only be found by column index; the length check keeps the indices honest
      clientRow(clientId)
        .findAllByRole("gridcell")
        .should("have.length", 6)
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
    // a pattern: the tab icon's aria-label makes the name "history icon Revoked"
    cy.findByRole("tab", { name: /Revoked/ }).click();
    cy.get<string>("@clientId").then((clientId) => {
      clientRow(clientId)
        .should("contain", CLIENT_NAME)
        .and("contain", ADMIN_NAME)
        .click();
    });

    cy.log("Its activity shows the revoke, not the timeline from before it");
    cy.findByTestId("oauth-client-activity").should("contain", "Revoked");

    cy.log("The token it issued no longer authenticates");
    cy.get<string>("@accessToken").then((accessToken) => {
      requestCurrentUserWithBearerOnly(accessToken)
        .its("status")
        .should("eq", 401);
    });
  });
});

describe("scenarios > monitor > oauth client management > access", () => {
  beforeEach(() => {
    H.restore();
  });

  it("shows the upsell to an admin without the feature", () => {
    cy.signInAsAdmin();
    // a valid token without `session-management`
    H.activateToken("starter");
    cy.visit(PATH);

    cy.log("The nav item is there, marked as an upsell");
    cy.findByTestId("monitor-nav")
      .findByRole("link", { name: "OAuth clients" })
      .should("be.visible")
      .findByTestId("upsell-gem")
      .should("be.visible");

    cy.log("The page upsells rather than listing anyone's clients");
    cy.location("pathname").should("eq", PATH);
    cy.findByTestId("monitor-main")
      .findByText("See which programs can act as your users, and cut one off")
      .should("be.visible");
    cy.findByTestId("oauth-clients-table").should("not.exist");
  });

  it("is admin-only", () => {
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.signInAsNormalUser();
    cy.visit(PATH);
    cy.location("pathname").should("eq", "/unauthorized");
  });
});

const clientRow = (clientId: string) =>
  cy.findByTestId(`oauth-client-row-${clientId}`);

// Clears cookies first, since a session beats a bearer and would mask a dead token. Leaves the test signed out.
function requestCurrentUserWithBearerOnly(accessToken: string) {
  cy.clearCookies();
  return cy.request<{ email: string }>({
    method: "GET",
    url: "/api/user/current",
    headers: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: false,
  });
}
