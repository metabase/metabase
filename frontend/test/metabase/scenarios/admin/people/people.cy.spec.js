import _ from "underscore";
import {
  restore,
  modal,
  popover,
  setupSMTP,
  describeEE,
} from "__support__/e2e/helpers";
import { USERS, USER_GROUPS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { normal, admin } = USERS;
const { DATA_GROUP } = USER_GROUPS;
const TOTAL_USERS = Object.entries(USERS).length;
const TOTAL_GROUPS = Object.entries(USER_GROUPS).length;
const { ORDERS_ID } = SAMPLE_DATABASE;

const TEST_USER = {
  first_name: "Testy",
  last_name: "McTestface",
  email: `testy${Math.round(Math.random() * 100000)}@metabase.test`,
  password: "12341234",
};

describe("scenarios > admin > people", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("user management", () => {
    it("should render (metabase-enterprise#210)", () => {
      cy.visit("/admin/people");

      assertTableRowsCount(TOTAL_USERS);

      cy.findByText(`${TOTAL_USERS} people found`);

      // A small sidebar selector
      cy.get(".AdminList-items").within(() => {
        cy.findByText("People").should("have.class", "selected");
        cy.findByText("Groups").click();
      });

      cy.log("Switch to 'Groups' and make sure it renders properly");
      cy.get(".PageTitle").contains("Groups");

      assertTableRowsCount(TOTAL_GROUPS);

      cy.get(".AdminList-items").within(() => {
        cy.findByText("Groups").should("have.class", "selected");
      });

      cy.log(
        "**Dig into one of the user groups and make sure its members are listed**",
      );
      cy.findByText("All Users").click();
      cy.get(".PageTitle").contains("All Users");

      // The same list as for "People"
      assertTableRowsCount(TOTAL_USERS);
    });

    it("should load the members when navigating to the group directly", () => {
      cy.visit(`/admin/people/groups/${DATA_GROUP}`);
      cy.findByText("No Collection Tableton");
      cy.findByText("Robert Tableton");
    });

    it("should allow admin to create new users", () => {
      const { first_name, last_name, email } = TEST_USER;
      const FULL_NAME = `${first_name} ${last_name}`;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      // first modal
      cy.findByLabelText("First name").type(first_name);
      cy.findByLabelText("Last name").type(last_name);
      cy.findByLabelText("Email").type(email);
      clickButton("Create");

      // second modal
      cy.findByText(`${FULL_NAME} has been added`);
      cy.findByText("Show").click();
      cy.findByText("Done").click();

      cy.findByText(FULL_NAME);
    });

    it("should allow admin to create new users without first name or last name (metabase#22754)", () => {
      const { email } = TEST_USER;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      cy.findByLabelText("Email").type(email);
      clickButton("Create");

      // second modal
      cy.findByText(`${email} has been added`);
      cy.findByText("Show").click();
      cy.findByText("Done").click();

      cy.findByText(email);
    });

    it("should disallow admin to create new users with case mutation of existing user", () => {
      const { first_name, last_name, email } = normal;
      cy.visit("/admin/people");
      clickButton("Invite someone");

      cy.findByLabelText("First name").type(first_name + "New");
      cy.findByLabelText("Last name").type(last_name + "New");
      cy.findByLabelText("Email").type(email.toUpperCase());
      clickButton("Create");
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
      const { first_name, last_name } = admin;
      const FULL_NAME = `${first_name} ${last_name}`;

      cy.visit("/admin/people");
      showUserOptions(FULL_NAME);
      popover().within(() => {
        cy.findByText("Edit user");
        cy.findByText("Reset password");
        cy.findByText("Deactivate user").should("not.exist");
      });
    });

    it("should allow admin to deactivate and reactivate other admins/users", () => {
      // Turn a random existing user into an admin
      cy.request("PUT", "/api/user/2", {
        is_superuser: true,
      }).then(({ body }) => {
        const { first_name, last_name } = body;
        const FULL_NAME = `${first_name} ${last_name}`;

        cy.visit("/admin/people");
        showUserOptions(FULL_NAME);

        cy.findByText("Deactivate user").click();
        clickButton("Deactivate");
        cy.findByText(FULL_NAME).should("not.exist");

        cy.log("It should load inactive users");
        cy.findByText("Deactivated").click();
        cy.findByText(FULL_NAME);
        cy.icon("refresh").click();
        cy.findByText(`Reactivate ${FULL_NAME}?`);
        clickButton("Reactivate");
      });
    });

    it("should edit existing user details", () => {
      const { first_name, last_name } = normal;
      const FULL_NAME = `${first_name} ${last_name}`;
      const NEW_NAME = "John";
      const NEW_FULL_NAME = `${NEW_NAME} ${last_name}`;

      cy.visit("/admin/people");
      showUserOptions(FULL_NAME);
      cy.findByText("Edit user").click();
      cy.findByDisplayValue(first_name).click().clear().type(NEW_NAME);

      clickButton("Update");
      cy.findByText(NEW_FULL_NAME);
    });

    it("should reset user password without SMTP set up", () => {
      const { first_name, last_name } = normal;
      const FULL_NAME = `${first_name} ${last_name}`;

      cy.visit("/admin/people");
      showUserOptions(FULL_NAME);
      cy.findByText("Reset password").click();
      cy.findByText(`Reset ${FULL_NAME}'s password?`);
      clickButton("Reset password");
      cy.findByText(`${FULL_NAME}'s password has been reset`);
      cy.findByText(/^temporary password$/i);
      clickButton("Done");
    });

    it("should reset user password with SMTP set up", () => {
      const { first_name, last_name } = normal;
      const FULL_NAME = `${first_name} ${last_name}`;

      setupSMTP();

      cy.visit("/admin/people");
      showUserOptions(FULL_NAME);
      cy.findByText("Reset password").click();
      cy.findByText(`Reset ${FULL_NAME}'s password?`);
      clickButton("Reset password");
      cy.findByText(`${FULL_NAME}'s password has been reset`).should(
        "not.exist",
      );
      cy.findByText(/^temporary password$/i).should("not.exist");
    });

    it("should allow to search people", () => {
      cy.visit("/admin/people");

      cy.findByPlaceholderText("Find someone").type("no");
      cy.findByText("5 people found");
      assertTableRowsCount(5);

      cy.findByPlaceholderText("Find someone").type("ne");
      cy.findByText("1 person found");
      assertTableRowsCount(1);

      cy.findByPlaceholderText("Find someone").clear();
      cy.findByText(`${TOTAL_USERS} people found`);
      assertTableRowsCount(TOTAL_USERS);
    });

    it("should display more than 50 groups (metabase#17200)", () => {
      generateGroups(51);

      cy.visit("/admin/people/groups");
      cy.get("main").scrollTo("bottom");
      cy.findByText("readonly");
    });

    describe("email configured", () => {
      beforeEach(() => {
        // Setup email server, since we show different modal message when email isn't configured
        setupSMTP();

        // Setup Google authentication
        cy.request("PUT", "/api/setting", {
          "google-auth-client-id": "fake-id.apps.googleusercontent.com",
          "google-auth-auto-create-accounts-domain": "metabase.com",
        });
      });

      it("invite member when SSO is not configured", () => {
        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        cy.visit("/admin/people");

        clickButton("Invite someone");

        // first modal
        cy.findByLabelText("First name").type(first_name);
        cy.findByLabelText("Last name").type(last_name);
        cy.findByLabelText("Email").type(email);
        clickButton("Create");

        // second modal
        cy.findByText(`${FULL_NAME} has been added`);
        cy.contains(
          `We’ve sent an invite to ${email} with instructions to set their password.`,
        );
        cy.findByText("Done").click();

        cy.findByText(FULL_NAME);
      });

      it("invite member when SSO is configured metabase#23630", () => {
        // Setup Google authentication
        cy.request("PUT", "/api/setting", {
          "enable-password-login": false,
        });

        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        cy.visit("/admin/people");

        clickButton("Invite someone");

        // first modal
        cy.findByLabelText("First name").type(first_name);
        cy.findByLabelText("Last name").type(last_name);
        cy.findByLabelText("Email").type(email);
        clickButton("Create");

        // second modal
        cy.findByText(`${FULL_NAME} has been added`);
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
        cy.findByText("Done").click();

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
        cy.findByText(`${NEW_TOTAL_USERS} people found`);

        // Page 1
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
        cy.findByTestId("previous-page-btn").should("be.disabled");

        cy.findByTestId("next-page-btn").click();
        waitForUserRequests();
        cy.findByText("Loading...").should("not.exist");

        // Page 2
        cy.findByTextEnsureVisible(`${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`);
        assertTableRowsCount(NEW_TOTAL_USERS % PAGE_SIZE);
        cy.findByTestId("next-page-btn").should("be.disabled");

        cy.findByTestId("previous-page-btn").click();
        cy.wait("@users");
        cy.findByText("Loading...").should("not.exist");

        // Page 1
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
      });

      it("should allow paginating group members forward and backward", () => {
        const PAGE_SIZE = 25;
        cy.visit("admin/people/groups/1");

        // Total
        cy.findByText(`${NEW_TOTAL_USERS} members`);

        // Page 1
        cy.findByText(`1 - ${PAGE_SIZE}`);
        assertTableRowsCount(PAGE_SIZE);
        cy.findByTestId("previous-page-btn").should("be.disabled");

        cy.findByTestId("next-page-btn").click();
        waitForUserRequests();
        cy.findByText("Loading...").should("not.exist");

        // Page 2
        cy.findByTextEnsureVisible(`${PAGE_SIZE + 1} - ${NEW_TOTAL_USERS}`);
        assertTableRowsCount(NEW_TOTAL_USERS % PAGE_SIZE);
        cy.findByTestId("next-page-btn").should("be.disabled");

        cy.findByTestId("previous-page-btn").click();
        cy.wait("@users");
        cy.findByText("Loading...").should("not.exist");

        // Page 1
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
    const { first_name, last_name } = admin;
    const fullName = `${first_name} ${last_name}`;

    cy.visit("/account/notifications");
    cy.findByText("Question");
    cy.findByText("Dashboard");

    cy.visit("/admin/people");
    showUserOptions(fullName);

    popover().within(() => {
      cy.findByText("Unsubscribe from all subscriptions / alerts").click();
    });

    modal().within(() => {
      cy.findAllByText(fullName, { exact: false });
      cy.findByText("Unsubscribe").click();
      cy.findByText("Unsubscribe").should("not.exist");
    });

    cy.visit("/account/notifications");
    cy.findByLabelText("bell icon");
    cy.findByText("Question").should("not.exist");
    cy.findByText("Dashboard").should("not.exist");
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
  cy.get(".ContentTable tbody tr").should("have.length", length);
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
