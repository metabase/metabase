import {
  restore,
  signInAsAdmin,
  setupDummySMTP,
  USERS,
} from "__support__/cypress";
const { admin } = USERS;

describe("scenarios > dashboard > subscriptions", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should not allow creation if there are no dashboard cards", () => {
    cy.log("**Create fresh new dashboard**");
    cy.request("POST", "/api/dashboard", {
      name: "Empty Dashboard",
    }).then(({ body: { id: DASHBOARD_ID } }) => {
      cy.visit(`/dashboard/${DASHBOARD_ID}`);
    });
    // It would be great if we can use either aria-attributes or better class naming to suggest when icons are disabled
    cy.get(".Icon-share")
      .closest("a")
      .should("have.class", "cursor-default");
  });

  describe("with no channels set up", () => {
    it("should instruct user to connect email or slack", () => {
      openDashboardSubscriptions();
      // Look for the messaging about configuring slack and email
      cy.findByRole("link", { name: /set up email/i });
      cy.findByRole("link", { name: /configure Slack/i });
    });
  });

  describe("with email and slack set up", () => {
    beforeEach(() => {
      setupDummySMTP();
    });

    describe("with no existing subscriptions", () => {
      it("should allow creation of a new email subscription", () => {
        createEmailSubscription();
        cy.findByText("Emailed daily at 8:00 AM");
      });
    });

    describe("with existing subscriptions", () => {
      beforeEach(createEmailSubscription);
      it("should show existing dashboard subscriptions", () => {
        openDashboardSubscriptions();
        cy.findByText("Emailed daily at 8:00 AM");
      });
    });

    it("should persist attachments for dashboard subscriptions (metabase#14117)", () => {
      assignRecipient();
      // This is extremely fragile
      // TODO: update test once changes from `https://github.com/metabase/metabase/pull/14121` are merged into `master`
      cy.findByText("Attach results")
        .parent()
        .parent()
        .next()
        .find("a") // Toggle
        .click();
      cy.findByText("Questions to attach").click();
      clickButton("Done");
      cy.findByText("Subscriptions");
      cy.findByText("Emailed daily at 8:00 AM").click();
      cy.findByText("Delete this subscription").scrollIntoView();
      cy.findByText("Questions to attach");
      cy.findAllByRole("listitem")
        .contains("Orders") // yields the whole <li> element
        .within(() => {
          cy.findByRole("checkbox").should("have.attr", "aria-checked", "true");
        });
    });
  });
});

// Helper functions
function openDashboardSubscriptions(dashboard_id = 1) {
  // Orders in a dashboard
  cy.visit(`/dashboard/${dashboard_id}`);
  cy.get(".Icon-share").click();
  cy.findByText("Dashboard subscriptions").click();
}

function assignRecipient(user = admin) {
  openDashboardSubscriptions();
  cy.findByText("Email it").click();
  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(`${user.first_name} ${user.last_name}{enter}`);
}

function clickButton(button_name) {
  cy.contains(button_name)
    .closest(".Button")
    .should("not.be.disabled")
    .click();
}

function createEmailSubscription() {
  assignRecipient();
  clickButton("Done");
}
