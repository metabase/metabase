const { H } = cy;
import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { normal, admin, nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;
const TOTAL_USERS = Object.entries(USERS).length;
const { ORDERS_ID } = SAMPLE_DATABASE;

const TEST_USER = {
  first_name: "Testy",
  last_name: "McTestface",
  email: `testy${Math.round(Math.random() * 100000)}@metabase.test`,
  password: "12341234",
};

const adminUserName = H.getFullName(admin);
const noCollectionUserName = H.getFullName(nocollection);
const normalUserName = H.getFullName(normal);

describe("scenarios > admin > people", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("user management", () => {
    it("should keep group membership counts in step with the people and groups screens (metabase-enterprise#210, metabase#12693, metabase#21521)", () => {
      cy.visit("/admin/people");

      cy.findByTestId("admin-layout-sidebar").findByText("Groups").click();
      cy.findByTestId("admin-layout-content").within(() => {
        cy.findByText("All Users").click();
      });
      cy.findByTestId("admin-pane-page-title").contains("All Users");

      cy.log("The All Users group holds every user");
      assertTableRowsCount(TOTAL_USERS);
      cy.findByTestId("admin-layout-content").findByText(
        `${TOTAL_USERS} members`,
      );

      const GROUP = "collection";

      cy.findByTestId("admin-layout-sidebar").findByText("Groups").click();
      cy.findByTestId("admin-layout-content")
        .findByText(GROUP)
        .closest("tr")
        .contains("4");
      cy.findByTestId("admin-layout-content").findByText(GROUP).click();

      cy.findByTestId("admin-layout-content").findByText("4 members");

      cy.log("Adding a member bumps the count the backend reports");
      cy.button("Add members").click();
      cy.focused().type(admin.first_name);
      H.popover().findByText(adminUserName).click();
      cy.button("Add").click();

      cy.findByTestId("admin-layout-content").findByText("5 members");

      cy.log("...and removing them right away brings it back (metabase#21521)");
      removeUserFromGroup(adminUserName);
      cy.findByTestId("admin-layout-content").findByText("4 members");

      cy.log("Visiting a group directly loads its members");
      cy.visit(`/admin/people/groups/${DATA_GROUP}`);
      cy.findByTestId("admin-layout-content").findByText("2 members");

      cy.log("Deactivating a user drops them from the group counts");
      cy.findByTestId("admin-layout-sidebar").findByText("People").click();

      showUserOptions(noCollectionUserName);
      H.popover().findByText("Deactivate user").click();
      clickButton("Deactivate");

      cy.findByTestId("admin-layout-sidebar").findByText("Groups").click();
      cy.findByRole("table").findByRole("link", { name: /data$/i }).click();

      cy.findByTestId("admin-layout-content").findByText("1 member");

      removeUserFromGroup(normalUserName);
      cy.findByTestId("admin-layout-content").within(() => {
        cy.findByText("0 members");
        cy.findByText("Add members to get started.");
      });
    });

    it(
      "should allow admin to create new users",
      { tags: "@prerelease" },
      () => {
        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        cy.visit("/admin/people");
        clickButton("Invite someone");

        H.modal().within(() => {
          cy.findByLabelText("First name").type(first_name);
          cy.findByLabelText("Last name").type(last_name);
          cy.findByLabelText(/Email/).type(email);
        });
        clickButton("Create");

        H.modal().within(() => {
          cy.findByText(`${FULL_NAME} has been added`);
          cy.button("Done").click();
        });

        cy.findByTestId("admin-people-list-table").findByText(FULL_NAME);
        cy.location().should((loc) =>
          expect(loc.pathname).to.eq("/admin/people"),
        );
      },
    );

    it("should keep the 'Invite someone' button usable on smaller screen sizes (metabase#16350)", () => {
      cy.viewport(1000, 600);
      cy.visit("/admin/people");

      clickButton("Invite someone");

      H.modal().findByLabelText("First name").should("be.visible");
    });

    it(
      "should reset user password with SMTP set up",
      { tags: "@external" },
      () => {
        H.setupSMTP();

        cy.visit("/admin/people");
        showUserOptions(normalUserName);
        H.popover().findByText("Reset password").click();

        H.modal().within(() => {
          cy.findByText(`Reset ${normalUserName}'s password?`);
          cy.button("Get reset link").should("exist");
          cy.button("Reset password").click();
        });

        H.undoToast().within(() => {
          cy.findByText(
            `Password reset email sent to ${normalUserName}`,
          ).should("be.visible");
        });

        cy.log("Should not show temporary password modal");
        H.modal().should("not.exist");
      },
    );
  });
});

describe("scenarios > admin > people", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should unsubscribe a user from all subscriptions and alerts", () => {
    H.getCurrentUser().then(({ body: { id: user_id } }) => {
      H.createQuestionAndDashboard({
        questionDetails: getQuestionDetails(),
      }).then(({ body: { card_id, dashboard_id } }) => {
        H.createQuestionAlert({ user_id, card_id });
        H.createPulse(getPulseDetails({ card_id, dashboard_id }));
      });
    });

    cy.visit("/account/notifications");
    cy.findByTestId("notifications-list").within(() => {
      cy.findByText("Question");
      cy.findByText("Dashboard");
    });

    cy.visit("/admin/people");
    showUserOptions(adminUserName);

    H.popover().within(() => {
      cy.findByText("Unsubscribe from all subscriptions / alerts").click();
    });

    H.modal().within(() => {
      cy.findAllByText(adminUserName, { exact: false });
      cy.findByText("Unsubscribe").click();
      cy.findByText("Unsubscribe").should("not.exist");
    });

    cy.visit("/account/notifications");
    cy.findByLabelText("bell icon");
    // The list is replaced by the empty state once nothing is left in it.
    cy.findByTestId("notifications-list").should("not.exist");
  });
});

function showUserOptions(full_name) {
  cy.findByTestId("admin-people-list-table")
    .findByText(full_name)
    .closest("tr")
    .within(() => {
      cy.icon("ellipsis").click();
    });
}

function clickButton(button_name, opts = {}) {
  cy.button(button_name, opts).should("not.be.disabled").click();
}

function assertTableRowsCount(length) {
  cy.findByTestId("admin-layout-content")
    .get("table tbody tr")
    .should("have.length", length);
}

function getQuestionDetails() {
  return {
    name: "Question",
    query: {
      "source-table": ORDERS_ID,
    },
  };
}

function getPulseDetails({ card_id, dashboard_id }) {
  return {
    name: "Dashboard",
    dashboard_id,
    cards: [
      {
        id: card_id,
        include_csv: false,
        include_xls: false,
      },
    ],
    channels: [
      {
        enabled: true,
        channel_type: "slack",
        schedule_type: "hourly",
      },
    ],
  };
}

function removeUserFromGroup(fullName) {
  cy.findByTestId("admin-layout-content")
    .findByText(fullName)
    .closest("tr")
    .find(".Icon-close")
    .click();
}
