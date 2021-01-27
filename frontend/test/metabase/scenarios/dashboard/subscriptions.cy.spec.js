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

  describe("with email set up", () => {
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

    it("should not display 'null' day of the week (metabase#14405)", () => {
      assignRecipient();
      cy.findByText("To:").click();
      cy.get(".AdminSelect")
        .contains("Daily")
        .click();
      cy.findByText("Monthly").click();
      cy.get(".AdminSelect")
        .contains("First")
        .click();
      cy.findByText("15th (Midpoint)").click();
      cy.get(".AdminSelect")
        .contains("15th (Midpoint)")
        .click();
      cy.findByText("First").click();
      clickButton("Done");
      // Implicit assertion (word mustn't contain string "null")
      cy.findByText(/^Emailed monthly on the first (?!null)/);
    });
  });

  describe("with Slack set up", () => {
    beforeEach(() => {
      // Stubbing the response in advance (Cypress will intercept it when we navigate to "Dashboard subscriptions")
      cy.server();
      cy.route("GET", "/api/pulse/form_input", {
        channels: {
          email: {
            type: "email",
            name: "Email",
            allows_recipients: false,
            recipients: ["user", "email"],
            schedules: ["daily", "weekly", "monthly"],
            configured: false,
          },
          slack: {
            type: "slack",
            name: "Slack",
            allows_recipients: true,
            schedules: ["hourly", "daily", "weekly", "monthly"],
            fields: [
              {
                name: "channel",
                type: "select",
                displayName: "Post to",
                options: ["#work", "#play"],
                required: true,
              },
            ],
            configured: true,
          },
        },
      });
      openDashboardSubscriptions();
    });

    it("should not enable 'Done' button before channel is selected (metabase#14494)", () => {
      cy.findByText("Send it to Slack").click();
      cy.findByText("Send this dashboard to Slack");
      cy.findAllByRole("button", { name: "Done" }).should("be.disabled");
      cy.findByText("Pick a user or channel...").click();
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
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
