import { USERS } from "e2e/support/cypress_data";
import {
  NODATA_USER_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { BackendResponse } from "e2e/support/helpers/e2e-admin-request-tasks";
import {
  JWT_SHARED_SECRET,
  enableJwtAuth,
} from "e2e/support/helpers/e2e-jwt-helpers";
import type { SessionListResponse } from "metabase-types/api";

const { H } = cy;

const { normal, nodata } = USERS;

const JWT_USER = {
  email: "jwt.user@example.com",
  first_name: "Jay",
  last_name: "Doubleyoo",
};

const LDAP_USER = { email: "user01@example.org", password: "123456" };

/** What creating a support access grant returns: the grant, and the token that redeems it */
type CreatedGrant = { id: number; token: string };

/** A session created outside the browser: its credential, and its id as the admin's list shows it */
type TestSession = { key: string; id: string };

describe("scenarios > monitor > session management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("POST", "/api/ee/session-management/revoke").as("revoke");
  });

  it(
    "an admin finds and revokes sessions across auth methods",
    { tags: "@external" },
    () => {
      enableJwtAuth();
      H.setupLdap();
      startSession(passwordLogin(normal)).as("normalA");
      startSession(passwordLogin(normal)).as("normalB");
      startSession(passwordLogin(nodata)).as("nodataA");
      startSession(passwordLogin(nodata)).as("nodataB");
      startSession(passwordLogin(USERS.readonly)).as("readonly");
      startSession(passwordLogin(USERS.nocollection)).as("nocollection");
      startSession(passwordLogin(USERS.nosql)).as("signedOut");
      startSession(jwtLogin(JWT_USER)).as("jwt");
      startSession(passwordLogin(LDAP_USER)).as("ldap");

      withSessions(
        [
          "normalA",
          "normalB",
          "nodataA",
          "nodataB",
          "readonly",
          "nocollection",
          "signedOut",
          "jwt",
          "ldap",
        ],
        (s) => {
          cy.log("One user signs themselves out before the admin arrives");
          cy.task<BackendResponse>("backendRequest", {
            method: "DELETE",
            url: "/api/session",
            sessionId: s.signedOut.key,
          });
          expectEnded(s.signedOut);

          cy.log("Each live session shows the auth method it was created with");
          visitSessions();
          sessionRow(s.normalA)
            .should("contain", "Robert Tableton")
            .and("contain", "Password");
          sessionRow(s.jwt)
            .should("contain", "Jay Doubleyoo")
            .and("contain", "JWT");
          sessionRow(s.ldap).should("contain", "LDAP");
          sessionRow(s.signedOut).should("not.exist");

          cy.log(
            "The admin narrows the list to SSO sessions and revokes the LDAP one",
          );
          cy.button("Show filters").click();
          H.popover().findByRole("button", { name: "JWT" }).click();
          H.popover().findByRole("button", { name: "LDAP" }).click();
          H.popover().button("Apply").click();
          sessionRow(s.jwt).should("be.visible");
          sessionRow(s.ldap).should("be.visible");
          sessionRow(s.normalA).should("not.exist");

          sessionRow(s.ldap).click();
          sessionSidebar().button("Revoke session").click();
          confirmRevoke("Revoke this session?");
          expectToast("Revoked 1 session");
          expectEnded(s.ldap);
          expectLive(s.jwt);
          sessionRow(s.ldap).should("not.exist");
          expectRevokedOnEndedTab(s.ldap);

          cy.button("Show filters").click();
          H.popover().button("Clear filters").click();

          cy.log(
            "The admin searches for a user and revokes one of their sessions",
          );
          cy.findByLabelText("Search sessions").type("Robert");
          sessionRow(s.normalA).should("be.visible");
          sessionRow(s.normalB).should("be.visible");
          sessionRow(s.nodataA).should("not.exist");

          sessionRow(s.normalA).click();
          sessionSidebar().button("Revoke session").click();
          confirmRevoke("Revoke this session?");
          expectToast("Revoked 1 session");
          expectEnded(s.normalA);
          expectLive(s.normalB);
          expectRevokedOnEndedTab(s.normalA);

          cy.log(
            "The admin finds another user and revokes all of their sessions",
          );
          cy.findByLabelText("Search sessions").clear().type("No Data");
          sessionRow(s.nodataA).should("be.visible");
          sessionRow(s.normalB).should("not.exist");

          sessionRow(s.nodataA).click();
          sessionSidebar().button("Revoke active sessions").click();
          confirmRevoke("Revoke all sessions for No Data Tableton?");
          // no count: the other users' cached sessions H.restore() brings back are revoked too
          expectToast("Revoked");
          expectEnded(s.nodataA);
          expectEnded(s.nodataB);
          expectLive(s.normalB);
          expectRevokedOnEndedTab(s.nodataA, s.nodataB);

          cy.log("The admin clears the search and revokes a selection in bulk");
          cy.findByLabelText("Search sessions").clear();
          sessionRow(s.normalB).findByRole("checkbox").click();
          sessionRow(s.readonly).findByRole("checkbox").click();
          cy.findByTestId("toast-card")
            .should("contain", "2 sessions selected")
            .button("Revoke")
            .click();
          confirmRevoke("Revoke 2 sessions?");
          expectToast("Revoked 2 sessions");
          expectEnded(s.normalB);
          expectEnded(s.readonly);
          expectLive(s.nocollection);
          expectRevokedOnEndedTab(s.normalB, s.readonly);

          cy.log("The admin revokes everyone else, and stays signed in");
          cy.button("Revoke all active sessions").click();
          confirmRevoke("Revoke all sessions?");
          // no count: the other users' cached sessions H.restore() brings back are revoked too
          expectToast("Revoked");
          expectEnded(s.nocollection);
          expectEnded(s.jwt);
          expectRevokedOnEndedTab(s.nocollection, s.jwt);

          visitSessions();
          cy.findByTestId("sessions-table")
            .findByText("This session")
            .should("be.visible");

          cy.log(
            "The admin's own session can't be selected or revoked from here",
          );
          currentSessionRow().findByRole("checkbox").should("be.disabled");
          currentSessionRow().click();
          sessionSidebar().should("contain", "Bobby Tables");
          sessionSidebar()
            .findByRole("button", { name: "Revoke session" })
            .should("not.exist");
          sessionSidebar()
            .findByRole("button", { name: "Revoke active sessions" })
            .should("not.exist");
          sessionSidebar().button("Close").click();

          cy.log("Every revoked session is on record as revoked by an admin");
          cy.findByTestId("sessions-tab-ended").click();
          sessionRow(s.signedOut).should("contain", "Signed out");

          cy.button("Show filters").click();
          H.popover().findByRole("textbox", { name: "Reason" }).click();
          cy.findByRole("option", { name: "Revoked by admin" }).click();
          H.popover().button("Apply").click();
          sessionRow(s.signedOut).should("not.exist");
          [
            s.ldap,
            s.normalA,
            s.nodataA,
            s.nodataB,
            s.normalB,
            s.readonly,
            s.nocollection,
            s.jwt,
          ].forEach((session) =>
            sessionRow(session).should("contain", "Revoked by admin"),
          );

          cy.log("Ended sessions are read-only");
          cy.findByTestId("sessions-table")
            .findAllByRole("checkbox")
            .should("not.exist");
          sessionRow(s.ldap).click();
          sessionSidebar().should("contain", "Revoked by admin");
          sessionSidebar()
            .findByRole("button", { name: "Revoke session" })
            .should("not.exist");
        },
      );
    },
  );

  it("records why a session ended when it ended outside the page", () => {
    startSession(passwordLogin(USERS.readonly)).as("loggedOut");
    startSession(passwordLogin(nodata)).as("deactivated");
    startSession(passwordLogin(normal)).as("passwordChanged");
    cy.task<CreatedGrant>("requestAsAdmin", {
      method: "POST",
      url: "/api/ee/support-access-grant",
      body: { grant_duration_minutes: 60 },
    }).as("grant");
    cy.get<CreatedGrant>("@grant").then(({ token }) =>
      startSession(supportAccessLogin(token)).as("supportAccess"),
    );

    withSessions(
      ["loggedOut", "deactivated", "passwordChanged", "supportAccess"],
      (s) => {
        cy.log("A support access session is attributed to its grant");
        visitSessions();
        sessionRow(s.supportAccess).should("contain", "Support access");

        cy.log("The user logs themselves out");
        cy.task<BackendResponse>("backendRequest", {
          method: "DELETE",
          url: "/api/session",
          sessionId: s.loggedOut.key,
        });

        cy.log("An admin deactivates another user");
        cy.task("requestAsAdmin", {
          method: "DELETE",
          url: `/api/user/${NODATA_USER_ID}`,
        });

        cy.log("An admin changes a third user's password");
        cy.task("requestAsAdmin", {
          method: "PUT",
          url: `/api/user/${NORMAL_USER_ID}/password`,
          body: { password: "NewPassword!session123" },
        });

        cy.log("An admin revokes the support access grant");
        cy.get<CreatedGrant>("@grant").then(({ id }) =>
          cy.task("requestAsAdmin", {
            method: "PUT",
            url: `/api/ee/support-access-grant/${id}/revoke`,
          }),
        );

        expectEnded(s.loggedOut);
        expectEnded(s.deactivated);
        expectEnded(s.passwordChanged);
        expectEnded(s.supportAccess);

        cy.findByTestId("sessions-tab-ended").click();
        sessionRow(s.loggedOut).should("contain", "Signed out");
        sessionRow(s.deactivated).should("contain", "User deactivated");
        sessionRow(s.passwordChanged).should("contain", "Password changed");
        sessionRow(s.supportAccess).should("contain", "Support access revoked");

        const ended = [
          s.loggedOut,
          s.deactivated,
          s.passwordChanged,
          s.supportAccess,
        ];
        const expectOnlyListed = (...listed: TestSession[]) =>
          ended.forEach((session) =>
            sessionRow(session).should(
              listed.includes(session) ? "be.visible" : "not.exist",
            ),
          );

        cy.log("Filtering by reason narrows the ended sessions");
        cy.button("Show filters").click();
        H.popover().findByRole("textbox", { name: "Reason" }).click();
        cy.findByRole("option", { name: "Password changed" }).click();
        H.popover().button("Apply").click();
        expectOnlyListed(s.passwordChanged);

        cy.log("Clearing the filters brings every ended session back");
        cy.button("Show filters").click();
        H.popover().button("Clear filters").click();
        expectOnlyListed(...ended);

        cy.log("Filtering by auth method narrows them too");
        cy.button("Show filters").click();
        H.popover().findByRole("button", { name: "Support access" }).click();
        H.popover().button("Apply").click();
        expectOnlyListed(s.supportAccess);

        cy.log("Searching matches the owner of an ended session");
        cy.button("Show filters").click();
        H.popover().button("Clear filters").click();
        cy.findByLabelText("Search sessions").type("Read Only");
        expectOnlyListed(s.loggedOut);
      },
    );
  });
});

describe("scenarios > monitor > session management > access", () => {
  beforeEach(() => {
    H.restore();
  });

  it("shows the upsell to an admin without the feature", () => {
    cy.signInAsAdmin();
    // a valid token that lacks the feature, rather than no token at all
    H.activateToken("starter");
    cy.visit("/monitor/sessions");
    cy.findByRole("heading", {
      name: "See who is signed in, and revoke access in one click",
    }).should("be.visible");
    cy.findByTestId("sessions-table").should("not.exist");
  });

  it("is admin-only", () => {
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.signInAsNormalUser();
    cy.visit("/monitor/sessions");
    cy.location("pathname").should("eq", "/unauthorized");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

type SessionAlias = string;

/** Signs in from Node with a username and password (which LDAP also uses), returning the session key */
function passwordLogin({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return () =>
    cy
      .task<BackendResponse<{ id: string }>>("backendRequest", {
        method: "POST",
        url: "/api/session",
        body: { username: email, password },
      })
      .then(({ body }) => body.id);
}

/** Redeems a support access grant from Node, as the support engineer would, returning the session key */
function supportAccessLogin(token: string) {
  return () =>
    cy
      .task<BackendResponse<{ session_id: string }>>("backendRequest", {
        method: "POST",
        url: "/api/session/reset_password",
        body: { token, password: "SupportPassword!123" },
      })
      .then(({ body }) => body.session_id);
}

/** Signs in from Node through JWT SSO, returning the session key from the cookie it sets */
function jwtLogin(payload: typeof JWT_USER) {
  return () =>
    cy
      .task<string>("signJwt", { payload, secret: JWT_SHARED_SECRET })
      .then((jwt) =>
        cy.task<BackendResponse>("backendRequest", {
          url: `/auth/sso?jwt=${jwt}`,
          failOnStatusCode: false,
        }),
      )
      .then(({ status, cookies }) => {
        expect(status, "the SSO redirect").to.eq(302);
        return cookies["metabase.SESSION"];
      });
}

function liveSessionIds() {
  return cy
    .task<SessionListResponse>("requestAsAdmin", {
      url: "/api/ee/session-management",
    })
    .then(({ data }) => data.map((session) => session.id));
}

/**
  Signs in with `login` outside the browser, so the admin's browser session is untouched. The session's id is
  whatever the login added to the admin's list.
 */
function startSession(
  login: () => Cypress.Chainable<string>,
): Cypress.Chainable<TestSession> {
  return liveSessionIds().then((before) =>
    login().then((key) =>
      liveSessionIds().then((after) => {
        const added = after.filter((id) => !before.includes(id));
        expect(added, "sessions the login created").to.have.length(1);
        return { key, id: added[0] };
      }),
    ),
  );
}

function withSessions<T extends SessionAlias>(
  aliases: T[],
  fn: (sessions: Record<T, TestSession>) => void,
) {
  // filled in by the `cy.get` chain below, which Cypress runs before `fn`
  const sessions = {} as Record<T, TestSession>;
  aliases.forEach((alias) =>
    cy.get<TestSession>(`@${alias}`).then((session) => {
      sessions[alias] = session;
    }),
  );
  cy.then(() => fn(sessions));
}

/** The status `GET /api/user/current` answers with when presented with `session`'s key */
function currentUserStatus(session: TestSession) {
  return cy
    .task<BackendResponse>("backendRequest", {
      url: "/api/user/current",
      sessionId: session.key,
      failOnStatusCode: false,
    })
    .its("status");
}

function expectLive(session: TestSession) {
  currentUserStatus(session).should("eq", 200);
}

function expectEnded(session: TestSession) {
  currentUserStatus(session).should("eq", 401);
}

function visitSessions() {
  // a fresh intercept per visit: a reused alias would be satisfied by a request from earlier in the test
  cy.intercept({
    method: "GET",
    pathname: "/api/ee/session-management",
  }).as("visitListSessions");
  cy.visit("/monitor/sessions");
  cy.wait("@visitListSessions");
}

function sessionRow(session: TestSession) {
  return cy.findByTestId(`session-row-${session.id}`);
}

/** The row of the session the admin's own browser is using, flagged "This session" */
function currentSessionRow() {
  return cy
    .findByTestId("sessions-table")
    .findByText("This session")
    .closest("[role='row']");
}

function sessionSidebar() {
  return cy.findByTestId("session-detail-sidebar");
}

function confirmRevoke(title: string) {
  H.modal().within(() => {
    cy.findByText(title).should("be.visible");
    cy.button("Revoke").click();
  });
  cy.wait("@revoke");
}

/** Switches to the Ended tab, checks that `sessions` are listed as revoked by an admin, and switches back */
function expectRevokedOnEndedTab(...sessions: TestSession[]) {
  cy.findByTestId("sessions-tab-ended").click();
  sessions.forEach((session) =>
    sessionRow(session).should("contain", "Revoked by admin"),
  );
  cy.findByTestId("sessions-tab-active").click();
}

function expectToast(message: string) {
  H.undoToast().should("contain", message);
  H.undoToast().icon("close").click();
  H.undoToast().should("not.exist");
}
