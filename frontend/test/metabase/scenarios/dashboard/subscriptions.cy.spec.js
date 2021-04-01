import {
  restore,
  setupDummySMTP,
  describeWithToken,
  describeOpenSourceOnly,
  popover,
} from "__support__/cypress";
import { USERS } from "__support__/cypress_data";
const { admin } = USERS;

describe("scenarios > dashboard > subscriptions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not allow creation if there are no dashboard cards", () => {
    cy.createDashboard("Empty Dashboard").then(
      ({ body: { id: DASHBOARD_ID } }) => {
        cy.visit(`/dashboard/${DASHBOARD_ID}`);
      },
    );
    // It would be great if we can use either aria-attributes or better class naming to suggest when icons are disabled
    cy.icon("share")
      .closest("a")
      .should("have.class", "cursor-default");
  });

  it.skip("should allow sharing if dashboard contains only text cards (metabase#15077)", () => {
    cy.createDashboard("15077D").then(({ body: { id: DASHBOARD_ID } }) => {
      cy.visit(`/dashboard/${DASHBOARD_ID}`);
    });
    cy.icon("pencil").click();
    cy.icon("string").click();
    cy.findByPlaceholderText("Write here, and use Markdown if you'd like")
      .click()
      .type("Foo");
    cy.findByRole("button", { name: "Save" }).click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.icon("share")
      .closest("a")
      .should("have.class", "cursor-pointer")
      .click();
    cy.findByText("Dashboard subscriptions").click();
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
      mockSlackConfigured();
      openDashboardSubscriptions();
      cy.findByText("Send it to Slack").click();
      cy.findByText("Send this dashboard to Slack");
    });

    it("should not enable 'Done' button before channel is selected (metabase#14494)", () => {
      cy.findAllByRole("button", { name: "Done" }).should("be.disabled");
      cy.findByText("Pick a user or channel...").click();
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });

    it.skip("should have 'Send to Slack now' button (metabase#14515)", () => {
      cy.findAllByRole("button", { name: "Send to Slack now" }).should(
        "be.disabled",
      );
      cy.findByText("Pick a user or channel...").click();
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });
  });

  describeOpenSourceOnly.only("OSS email subscriptions", () => {
    beforeEach(() => {
      cy.visit(`/dashboard/1`);
      setupDummySMTP();
    });

    describe("with parameters", () => {
      beforeEach(() => {
        addParametersToDashboard();
      });

      it("should have a list of the default parameters applied to the subscription", () => {
        assignRecipient();
        cy.findByText("Category is Corbin Mertz");
        clickButton("Done");

        cy.findByText("Category is Corbin Mertz");
      });
    });
  });

  describeWithToken("EE email subscriptions", () => {
    beforeEach(() => {
      cy.visit(`/dashboard/1`);
      setupDummySMTP();
    });

    describe("with no parameters", () => {
      it("should have no parameters section", () => {
        openDashboardSubscriptions();
        cy.findByText("Email it").click();

        cy.findByText("Set filter values for when this gets sent").should(
          "not.exist",
        );
      });
    });

    describe("with parameters", () => {
      beforeEach(() => {
        addParametersToDashboard();
      });

      it("should show a filter description containing default values, even when not explicitly added to subscription", () => {
        assignRecipient();
        clickButton("Done");

        cy.findByText("Category is Corbin Mertz");
      });

      it("should allow for setting parameters in subscription", () => {
        assignRecipient();
        clickButton("Done");

        cy.findByText("Emailed daily at 8:00 AM").click();

        cy.findAllByText("Corbin Mertz")
          .last()
          .click();
        popover()
          .find("input")
          .type("Bob");
        popover()
          .findByText("Bobby Kessler")
          .click();
        popover()
          .contains("Update filter")
          .click();

        cy.findAllByText("Dropdown 1")
          .last()
          .click();
        popover()
          .findByText("Gizmo")
          .click();
        popover()
          .contains("Add filter")
          .click();

        clickButton("Done");
        cy.findByText(
          "Category is Corbin Mertz and Bobby Kessler and 1 more filter",
        );
      });
    });
  });
});

// Helper functions
function openDashboardSubscriptions(dashboard_id = 1) {
  // Orders in a dashboard
  cy.visit(`/dashboard/${dashboard_id}`);
  cy.icon("share").click();
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

function addParametersToDashboard() {
  // edit dashboard
  cy.icon("pencil").click();

  // add Category > Dropdown "Name" filter
  cy.icon("filter").click();
  cy.findByText("Other Categories").click();
  cy.findByText("Dropdown").click();

  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("Name").click();
  });

  // add default value to the above filter
  cy.findByText("No default").click();
  popover()
    .find("input")
    .type("Corbin");
  popover()
    .findByText("Corbin Mertz")
    .click();
  popover()
    .contains("Add filter")
    .click();

  // add Category > Dropdown "Category" filter
  cy.icon("filter").click();
  cy.findByText("Other Categories").click();
  cy.findByText("Dropdown").click();
  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("Category").click();
  });

  cy.findByText("Save").click();
  // wait for dashboard to save
  cy.contains("You're editing this dashboard.").should("not.exist");
}

function mockSlackConfigured() {
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
}
