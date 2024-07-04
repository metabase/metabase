import _ from "underscore";

import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  COLLECTION_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  modal,
  popover,
  setupSMTP,
  describeEE,
  getFullName,
  setTokenFeatures,
  createApiKey,
} from "e2e/support/helpers";

const { sandboxed, normal, admin, nodata, nocollection } = USERS;
const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;
const TOTAL_USERS = Object.entries(USERS).length;
const TOTAL_GROUPS = Object.entries(USER_GROUPS).length;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { COLLECTION_GROUP } = USER_GROUPS;

const TEST_USER = {
  first_name: "Testy",
  last_name: "McTestface",
  email: `testy${Math.round(Math.random() * 100000)}@metabase.test`,
  password: "12341234",
};

const adminUserName = getFullName(admin);
const noCollectionUserName = getFullName(nocollection);
const normalUserName = getFullName(normal);

const totalUsers = Object.keys(USERS).length;

describe("scenarios > admin > people", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/permissions/group").as("getGroups");
    cy.intercept("GET", "/api/api-key").as("listApiKeys");
    restore();
    cy.signInAsAdmin();
  });

  describe("user management", () => {
    it("should be possible to switch beteween 'People' and 'Groups' tabs and to add/remove users to groups (metabase-enterprise#210, metabase#12693, metabase#21521)", () => {
      cy.visit("/admin/people");

      assertTableRowsCount(TOTAL_USERS);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${TOTAL_USERS} people found`);

      // A small sidebar selector
      cy.findByTestId("admin-layout-sidebar").within(() => {
        cy.findAllByTestId("left-nav-pane-item")
          .contains("People")
          .should("have.attr", "data-selected", "true");
        cy.log("Switch to 'Groups' and make sure it renders properly");
        cy.findByText("Groups").as("groupsTab").click();
        cy.findAllByTestId("left-nav-pane-item")
          .contains("Groups")
          .should("have.attr", "data-selected", "true");
      });
      cy.findByTestId("admin-pane-page-title").contains("Groups");
      assertTableRowsCount(TOTAL_GROUPS);

      cy.log(
        "Dig into one of the user groups and make sure its members are listed",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("All Users").click();
      cy.findByTestId("admin-pane-page-title").contains("All Users");

      // The same list as for "People"
      assertTableRowsCount(TOTAL_USERS);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${TOTAL_USERS} members`);

      // We cannot add new users to the "All users" group directly
      cy.button("Add members").should("not.exist");

      // Navigate to the collection group using the UI
      const GROUP = "collection";

      cy.get("@groupsTab").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(GROUP).closest("tr").contains("4");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(GROUP).click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("4 members");

      cy.button("Add members").click();
      cy.focused().type(admin.first_name);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(adminUserName).click();
      cy.button("Add").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("5 members");

      removeUserFromGroup(adminUserName);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("4 members");

      // should load the members when navigating to the group directly
      cy.visit(`/admin/people/groups/${DATA_GROUP}`);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("2 members");

      cy.findByRole("list", { name: "admin-list-items" })
        .findByRole("link", { name: /people/i })
        .click();

      showUserOptions(noCollectionUserName);

      popover().findByText("Deactivate user").click();

      clickButton("Deactivate");

      cy.findByRole("link", { name: /group/i }).click();

      cy.findByRole("table").findByRole("link", { name: /data/i }).click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1 member");

      removeUserFromGroup(normalUserName);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("0 members");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("A group is only as good as its members.");
    });

    it("should allow admin to create new users", { tags: "@smoke" }, () => {
      const { first_name, last_name, email } = TEST_USER;
      const FULL_NAME = `${first_name} ${last_name}`;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      // first modal
      cy.findByLabelText("First name").type(first_name);
      cy.findByLabelText("Last name").type(last_name);
      //
      cy.findByLabelText(/Email/).type(email);
      clickButton("Create");

      // second modal
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${FULL_NAME} has been added`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Done").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(FULL_NAME);
      cy.location().should(loc => expect(loc.pathname).to.eq("/admin/people"));
    });

    it("should allow admin to create new users without first name or last name (metabase#22754)", () => {
      const { email } = TEST_USER;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      cy.findByLabelText(/Email/).type(email);
      clickButton("Create");

      // second modal
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${email} has been added`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Show").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Done").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(email);
    });

    it("should disallow admin to create new users with case mutation of existing user", () => {
      const { first_name, last_name, email } = normal;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      cy.findByLabelText("First name").type(first_name + "New");
      cy.findByLabelText("Last name").type(last_name + "New");
      cy.findByLabelText(/Email/).type(email.toUpperCase());
      clickButton("Create");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Email address already in use.");
    });

    it("'Invite someone' button shouldn't be covered/blocked on smaller screen sizes (metabase#16350)", () => {
      cy.viewport(1000, 600);

      cy.visit("/admin/people");
      cy.button("Invite someone").click();
      // Modal should appear with the following input field
      cy.findByLabelText("First name");
    });

    it("should disallow admin to deactivate themselves", () => {
      cy.visit("/admin/people");
      showUserOptions(adminUserName);
      popover().within(() => {
        cy.findByText("Edit user");
        cy.findByText("Reset password");
        cy.findByText("Deactivate user").should("not.exist");
      });
    });

    it("should allow admin to deactivate and reactivate other admins/users", () => {
      // Turn a random existing user into an admin
      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
        is_superuser: true,
      }).then(({ body: user }) => {
        const FULL_NAME = getFullName(user);

        cy.visit("/admin/people");
        showUserOptions(FULL_NAME);

        cy.findByText("Deactivate user").click();
        clickButton("Deactivate");
        cy.findByText(FULL_NAME).should("not.exist");
        cy.location().should(loc =>
          expect(loc.pathname).to.eq("/admin/people"),
        );

        cy.log("It should load inactive users");
        cy.findByText("Deactivated").click();
        cy.findByText(FULL_NAME);
        cy.icon("refresh").click();
        cy.findByText(`Reactivate ${FULL_NAME}?`);
        clickButton("Reactivate");
        cy.location().should(loc =>
          expect(loc.pathname).to.eq("/admin/people"),
        );
      });
    });

    it("should edit existing user details", () => {
      const NEW_NAME = "John";
      const NEW_FULL_NAME = `${NEW_NAME} ${normal.last_name}`;

      cy.visit("/admin/people");
      showUserOptions(normalUserName);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit user").click();
      cy.findByDisplayValue(normal.first_name).click().clear().type(NEW_NAME);

      clickButton("Update");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(NEW_FULL_NAME);
      cy.location().should(loc => expect(loc.pathname).to.eq("/admin/people"));
    });

    it("should reset user password without SMTP set up", () => {
      cy.visit("/admin/people");
      showUserOptions(normalUserName);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Reset password").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Reset ${normalUserName}'s password?`);
      clickButton("Reset password");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${normalUserName}'s password has been reset`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^temporary password$/i);
      clickButton("Done");
      cy.location().should(loc => expect(loc.pathname).to.eq("/admin/people"));
    });

    it("should not offer to reset passwords when password login is disabled", () => {
      setTokenFeatures("all");
      cy.request("PUT", "/api/google/settings", {
        "google-auth-auto-create-accounts-domain": null,
        "google-auth-client-id": "example1.apps.googleusercontent.com",
        "google-auth-enabled": true,
      });

      cy.request("PUT", "/api/setting", {
        "enable-password-login": false,
      });
      cy.visit("/admin/people");
      showUserOptions(normalUserName);
      popover().findByText("Reset password").should("not.exist");
    });

    it(
      "should reset user password with SMTP set up",
      { tags: "@external" },
      () => {
        setupSMTP();

        cy.visit("/admin/people");
        showUserOptions(normalUserName);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Reset password").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`Reset ${normalUserName}'s password?`);
        clickButton("Reset password");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`${normalUserName}'s password has been reset`).should(
          "not.exist",
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(/^temporary password$/i).should("not.exist");
      },
    );

    it("should allow to search people", () => {
      cy.visit("/admin/people");

      cy.findByPlaceholderText("Find someone").type("no");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("5 people found");
      assertTableRowsCount(5);

      cy.findByPlaceholderText("Find someone").type("ne");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("1 person found");
      assertTableRowsCount(1);

      cy.findByPlaceholderText("Find someone").clear();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${TOTAL_USERS} people found`);
      assertTableRowsCount(TOTAL_USERS);
    });

    it("should allow group creation and deletion", () => {
      cy.intercept("POST", "/api/permissions/group").as("createGroup");
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");

      cy.visit("/admin/people/groups");
      cy.wait(["@getGroups", "@listApiKeys"]);

      cy.findByTestId("admin-panel").within(() => {
        cy.button("Create a group").click();
        cy.findByPlaceholderText(/something like/i).type("My New Group");
        cy.button("Add").click();
        cy.wait(["@createGroup", "@getGroups"]);

        cy.findByText("My New Group").closest("tr").icon("ellipsis").click();
      });

      popover().findByText("Remove Group").click();
      modal().button("Remove group").click();

      cy.wait(["@deleteGroup", "@getGroups"]);
      cy.findByTestId("admin-panel")
        .findByText("My New Group")
        .should("not.exist");
    });

    it("should display api keys included in a group and display a warning when deleting the group", () => {
      createApiKey("MyApiKey", COLLECTION_GROUP_ID);
      cy.visit("/admin/people/groups");
      cy.wait(["@getGroups", "@listApiKeys"]);

      cy.findByTestId("admin-panel")
        .findByText("collection")
        .closest("tr")
        .findByText("(includes 1 API key)");

      cy.findByTestId("admin-panel")
        .findByText("collection")
        .closest("tr")
        .icon("ellipsis")
        .click();

      popover().findByText("Remove Group").click();

      modal().within(() => {
        cy.findByText(
          "Are you sure you want remove this group and its API key?",
        );
        cy.button("Remove group and API key");
      });
    });

    it("should display more than 50 groups (metabase#17200)", () => {
      generateGroups(51);

      cy.visit("/admin/people/groups");
      cy.findByTestId("admin-layout-content").scrollTo("bottom");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("readonly");
    });

    describe("email configured", { tags: "@external" }, () => {
      beforeEach(() => {
        // Setup email server, since we show different modal message when email isn't configured
        setupSMTP();
        setupGoogleAuth();
      });

      it("invite member when SSO is not configured", () => {
        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        cy.visit("/admin/people");

        clickButton("Invite someone");

        // first modal
        cy.findByLabelText("First name").type(first_name);
        cy.findByLabelText("Last name").type(last_name);
        cy.findByLabelText(/Email/).type(email);
        clickButton("Create");

        // second modal
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`${FULL_NAME} has been added`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(
          `We’ve sent an invite to ${email} with instructions to set their password.`,
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(FULL_NAME);
      });
    });

    describe("pagination", () => {
      const NEW_USERS = 18;
      const NEW_TOTAL_USERS = TOTAL_USERS + NEW_USERS;

      const waitForUserRequests = () => {
        cy.wait("@users");
        cy.wait("@memberships");
      };

      beforeEach(() => {
        generateUsers(NEW_USERS);

        cy.intercept("GET", "/api/user*").as("users");
        cy.intercept("GET", "/api/permissions/membership").as("memberships");
      });

      it("should allow paginating people forward and backward", () => {
        const PAGE_SIZE = 25;

        cy.visit("/admin/people");

        waitForUserRequests();

        // Total
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`${NEW_TOTAL_USERS} people found`);

        // Page 1
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
        cy.findByLabelText("Previous page").should("be.disabled");

        // cy.findByLabelText("Next page").click();
        cy.findByTestId("next-page-btn").click();
        waitForUserRequests();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Loading...").should("not.exist");

        // Page 2
        cy.findByTestId("people-list-footer")
          .findByText(`${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`)
          .should("be.visible");
        assertTableRowsCount(NEW_TOTAL_USERS % PAGE_SIZE);
        cy.findByLabelText("Next page").should("be.disabled");

        cy.findByLabelText("Previous page").click();
        cy.wait("@users");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Loading...").should("not.exist");

        // Page 1
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
      });

      it("should allow paginating group members forward and backward", () => {
        const PAGE_SIZE = 25;
        cy.visit(`admin/people/groups/${ALL_USERS_GROUP}`);

        // Total
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`${NEW_TOTAL_USERS} members`);

        // Page 1
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
        cy.findByLabelText("Previous page").should("be.disabled");

        cy.findByLabelText("Next page").click();
        waitForUserRequests();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Loading...").should("not.exist");

        // Page 2
        cy.findByTextEnsureVisible(`${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`);
        assertTableRowsCount(NEW_TOTAL_USERS % PAGE_SIZE);
        cy.findByLabelText("Next page").should("be.disabled");

        cy.findByLabelText("Previous page").click();
        cy.wait("@users");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Loading...").should("not.exist");

        // Page 1
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
      });
    });
  });
});

describeEE("scenarios > admin > people", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should unsubscribe a user from all subscriptions and alerts", () => {
    cy.getCurrentUser().then(({ body: { id: user_id } }) => {
      cy.createQuestionAndDashboard({
        questionDetails: getQuestionDetails(),
      }).then(({ body: { card_id, dashboard_id } }) => {
        cy.createAlert(getAlertDetails({ user_id, card_id }));
        cy.createPulse(getPulseDetails({ card_id, dashboard_id }));
      });
    });

    cy.visit("/account/notifications");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Dashboard");

    cy.visit("/admin/people");
    showUserOptions(adminUserName);

    popover().within(() => {
      cy.findByText("Unsubscribe from all subscriptions / alerts").click();
    });

    modal().within(() => {
      cy.findAllByText(adminUserName, { exact: false });
      cy.findByText("Unsubscribe").click();
      cy.findByText("Unsubscribe").should("not.exist");
    });

    cy.visit("/account/notifications");
    cy.findByLabelText("bell icon");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Dashboard").should("not.exist");
  });

  it("invite member when SSO is configured metabase#23630", () => {
    setupSMTP();
    setupGoogleAuth();
    cy.request("PUT", "/api/setting", { "enable-password-login": false });

    const { first_name, last_name, email } = TEST_USER;
    const FULL_NAME = `${first_name} ${last_name}`;
    cy.visit("/admin/people");

    clickButton("Invite someone");

    // first modal
    cy.findByLabelText("First name").type(first_name);
    cy.findByLabelText("Last name").type(last_name);
    cy.findByLabelText(/Email/).type(email);
    clickButton("Create");

    // second modal
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${FULL_NAME} has been added`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(
      `We’ve sent an invite to ${email} with instructions to log in. If this user is unable to authenticate then you can reset their password.`,
    );
    cy.url().then(url => {
      const URL_REGEX = /\/admin\/people\/(?<userId>\d+)\/success/;
      const { userId } = URL_REGEX.exec(url).groups;
      assertLinkMatchesUrl(
        "reset their password.",
        `/admin/people/${userId}/reset`,
      );
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(FULL_NAME);
  });
});

describeEE("scenarios > admin > people > group managers", () => {
  function confirmLosingAbilityToManageGroup() {
    modal().within(() => {
      cy.findByText(
        "You will not be able to manage users of this group anymore.",
      );
      cy.button("Confirm").click();
    });
  }

  function removeFirstGroup() {
    cy.icon("ellipsis").eq(0).click();
    cy.findByText("Remove Group").click();
    cy.button("Remove group").click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.visit("/admin/people");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(normalUserName)
      .closest("tr")
      .findByText("2 other groups")
      .click();

    cy.findAllByTestId("user-type-toggle").click({ multiple: true });

    cy.signInAsNormalUser();
    cy.visit("/");
    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();
  });

  describe("group managers", () => {
    it("can manage groups from the group page", () => {
      cy.findByTestId("admin-left-nav-pane").within(() => {
        cy.findByTextEnsureVisible("Groups").click();
      });

      // Edit group name
      cy.icon("ellipsis").eq(0).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit Name").click();
      cy.get("input").type(" updated");
      cy.button("Done").click();

      // Click on the group with the new name
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("collection updated").click();

      // Add "No Collection" user as a member
      cy.button("Add members").click();
      cy.focused().type("No");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add").click();

      // Find user row
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName).closest("tr").as("userRow");

      // Promote to manager and demote back to member
      cy.get("@userRow").within(() => {
        cy.findByText("Member").realHover();
        cy.findAllByTestId("user-type-toggle").click();

        cy.findByText("Manager").realHover();
        cy.findAllByTestId("user-type-toggle").click();

        cy.findByText("Member");
      });

      // Delete the user
      cy.get("@userRow").within(() => {
        cy.icon("close").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName).should("not.exist");

      // Demote myself
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normalUserName)
        .closest("tr")
        .within(() => {
          cy.findByText("Manager").realHover();
          cy.findAllByTestId("user-type-toggle").click();
        });
      confirmLosingAbilityToManageGroup();

      // Redirected to the groups list
      cy.url().should("match", /\/admin\/people\/groups$/);

      // Open another group
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("data").click();

      // Remove myself
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normalUserName)
        .closest("tr")
        .within(() => {
          cy.icon("close").click();
        });
      confirmLosingAbilityToManageGroup();

      // Redirected to the home page
      cy.url().should("match", /\/$/);
    });

    it("can manage members from the people page", () => {
      // Open membership select for a user
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName)
        .closest("tr")
        .as("userRow")
        .within(() => {
          cy.findByText("data").click();
        });

      // Add the user to a group
      popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("2 other groups");
      });

      // Remove the user from the group
      popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("data");
      });

      // Promote and then demote the user
      popover().within(() => {
        cy.icon("arrow_up").click();
        cy.icon("arrow_down").click();
      });

      // Find own row
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normalUserName)
        .closest("tr")
        .within(() => {
          cy.findByText("2 other groups").click();
        });

      // Demote myself from being manager
      popover().within(() => {
        cy.icon("arrow_down").eq(0).click();
      });
      confirmLosingAbilityToManageGroup();

      // Remove myself from another group
      popover().within(() => {
        cy.findByText("data").click();
      });
      confirmLosingAbilityToManageGroup();

      // Redirected to the home page
      cy.url().should("match", /\/$/);
    });
  });

  it("after removing the last group redirects to the home page", () => {
    cy.findByTestId("admin-left-nav-pane").findByText("Groups").click();

    removeFirstGroup();
    cy.url().should("match", /\/admin\/people\/groups$/);

    removeFirstGroup();
    cy.url().should("match", /\/$/);
  });
});

describeEE("issue 23689", () => {
  function findUserByFullName(user) {
    const { first_name, last_name } = user;
    return cy.findByText(`${first_name} ${last_name}`);
  }

  function visitGroupPermissionsPage(groupId) {
    cy.visit(`/admin/people/groups/${groupId}`);
    cy.wait("@membership");
  }
  beforeEach(() => {
    // TODO: remove the next line when this issue gets fixed
    cy.skipOn(true);

    cy.intercept("GET", "/api/permissions/membership").as("membership");

    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    visitGroupPermissionsPage(COLLECTION_GROUP);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3 members");

    findUserByFullName(normal);
    findUserByFullName(nodata);

    // Make sandboxed user a group manager
    findUserByFullName(sandboxed)
      .closest("tr")
      .findByTestId("user-type-toggle")
      .click({ force: true });

    // Sanity check instead of waiting for the PUT request
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Manager");

    cy.sandboxTable({
      table_id: ORDERS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
      },
    });

    cy.signOut();
    cy.signInAsSandboxedUser();
  });

  it("sandboxed group manager should see all other members (metabase#23689)", () => {
    visitGroupPermissionsPage(COLLECTION_GROUP);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("3 members");

    findUserByFullName(sandboxed);
    findUserByFullName(normal);
    findUserByFullName(nodata);

    cy.visit("/admin/people");
    cy.wait("@membership");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${totalUsers} people found`);
    findUserByFullName(sandboxed);
    findUserByFullName(normal);
    findUserByFullName(nodata);
    findUserByFullName(nocollection);
  });
});

function showUserOptions(full_name) {
  cy.findByText(full_name)
    .closest("tr")
    .within(() => {
      cy.icon("ellipsis").click();
    });
}

function clickButton(button_name) {
  cy.button(button_name).should("not.be.disabled").click();
}

function assertTableRowsCount(length) {
  cy.findByTestId("admin-layout-content")
    .get("table tbody tr")
    .should("have.length", length);
}

function generateUsers(count, groupIds) {
  const users = _.range(count).map(index => ({
    first_name: `FirstName ${index}`,
    last_name: `LastName ${index}`,
    email: `user_${index}@metabase.com`,
    password: `secure password ${index}`,
    groupIds,
  }));

  users.forEach(u => cy.createUserFromRawData(u));

  return users;
}

function generateGroups(count) {
  _.range(count).map(index => {
    cy.request("POST", "api/permissions/group", { name: "Group" + index });
  });
}

function getQuestionDetails() {
  return {
    name: "Question",
    query: {
      "source-table": ORDERS_ID,
    },
  };
}

function getAlertDetails({ user_id, card_id }) {
  return {
    card: {
      id: card_id,
      include_csv: false,
      include_xls: false,
    },
    channels: [
      {
        enabled: true,
        channel_type: "email",
        schedule_type: "hourly",
        recipients: [
          {
            id: user_id,
          },
        ],
      },
    ],
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

function assertLinkMatchesUrl(text, url) {
  cy.findByRole("link", { name: text })
    .should("have.attr", "href")
    .and("eq", url);
}

function removeUserFromGroup(fullName) {
  cy.findByText(fullName).closest("tr").find(".Icon-close").click();
}

const setupGoogleAuth = () => {
  // Setup Google authentication
  cy.request("PUT", "/api/setting", {
    "google-auth-client-id": "fake-id.apps.googleusercontent.com",
    "google-auth-auto-create-accounts-domain": "metabase.com",
    "google-auth-enabled": true,
  });
};
