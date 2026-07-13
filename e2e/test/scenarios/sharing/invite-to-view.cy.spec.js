const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const PASSWORD = "Sup3r-S3cret-Pw!";

const inviteEmail = () =>
  `invitee-${Math.round(Math.random() * 1_000_000)}@metabase.test`;

/** Open the Share menu on the current dashboard/question and invite `email`. */
function inviteFromShareMenu(email) {
  H.openSharingMenu("Invite someone to view this");
  H.modal().within(() => {
    cy.findByLabelText(/Email/i).type(email);
    cy.button("Send invitation").click();
  });
}

/** Pull the Join link out of a sent invite email and decode the HTML entities. */
function joinUrlFromEmail(sent) {
  return sent.html
    .match(/href="([^"]*reset_password[^"]*)"/)[1]
    .replace(/&#x3D;/g, "=")
    .replace(/&amp;/g, "&");
}

/** Set a password on the new-user signup screen reached from a join link. */
function completeSignup() {
  cy.findByLabelText("Create a password").type(PASSWORD);
  cy.findByLabelText("Confirm your password").type(PASSWORD);
  cy.button("Save new password").click();
}

describe("scenarios > sharing > invite someone to view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("invite action in the Share menu", () => {
    it("invites someone to view a dashboard", () => {
      const email = inviteEmail();
      cy.intercept("POST", "/api/user").as("createUser");

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      inviteFromShareMenu(email);

      cy.wait("@createUser").then(({ request }) => {
        expect(request.body.email).to.eq(email);
        expect(request.body.invite_target).to.deep.include({
          type: "dashboard",
          id: ORDERS_DASHBOARD_ID,
        });
      });
    });

    it("invites someone to view a question", () => {
      const email = inviteEmail();
      cy.intercept("POST", "/api/user").as("createUser");

      H.visitQuestion(ORDERS_QUESTION_ID);
      inviteFromShareMenu(email);

      cy.wait("@createUser").then(({ request }) => {
        expect(request.body.invite_target).to.deep.include({
          type: "question",
          id: ORDERS_QUESTION_ID,
        });
      });
    });
  });
  describe("landing after signup", () => {
    beforeEach(() => H.setupSMTP());

    it("lands the invited user on the shared dashboard after they set a password", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      inviteFromShareMenu(inviteEmail());

      H.getInbox().then(({ body: [sent] }) => {
        cy.signOut();
        cy.visit(joinUrlFromEmail(sent));
        completeSignup();

        cy.location("pathname").should(
          "match",
          new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}(-|/|$)`),
        );
      });
    });
  });

  describe("permissions", () => {
    beforeEach(() => H.setupSMTP());

    // The redirect only navigates; it is not an access grant. An invitee whose
    // group cannot see the dashboard's collection lands on the route but hits the
    // no-access screen.
    it("does not grant access to the shared item", () => {
      cy.request("POST", "/api/collection", {
        name: "Restricted",
        parent_id: null,
      }).then(({ body: collection }) => {
        // revoke the All Users group's access to the new collection
        cy.request("GET", "/api/collection/graph").then(({ body: graph }) => {
          cy.request("PUT", "/api/collection/graph", {
            ...graph,
            groups: {
              ...graph.groups,
              [ALL_USERS_GROUP]: {
                ...graph.groups[ALL_USERS_GROUP],
                [collection.id]: "none",
              },
            },
          });
        });

        cy.request("POST", "/api/dashboard", {
          name: "Secret dashboard",
          collection_id: collection.id,
        }).then(({ body: dashboard }) => {
          H.visitDashboard(dashboard.id);
          inviteFromShareMenu(inviteEmail());

          H.getInbox().then(({ body: [sent] }) => {
            cy.signOut();
            cy.visit(joinUrlFromEmail(sent));
            completeSignup();

            cy.findByText(/don.t have permission to see that/i).should("exist");
          });
        });
      });
    });
  });
});
