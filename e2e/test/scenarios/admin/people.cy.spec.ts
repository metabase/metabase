const { H } = cy;
import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { COLLECTION_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, DashboardId } from "metabase-types/api";

const { normal, admin, nocollection } = USERS;
const { ADMIN_GROUP } = USER_GROUPS;
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
    // `*` matches the `?tenancy=…` variants (People tab, user modals), not just the param-less Groups-tab request.
    cy.intercept("GET", "/api/permissions/group*").as("getGroups");
    cy.intercept("GET", "/api/api-key").as("listApiKeys");
    H.restore();
    cy.signInAsAdmin();
  });

  describe("user management", () => {
    it(
      "should create an admin, then edit, deactivate and reactivate them (metabase#16350, metabase#60241)",
      { tags: "@prerelease" },
      () => {
        const { first_name, last_name, email } = TEST_USER;
        const FULL_NAME = `${first_name} ${last_name}`;
        const NEW_FULL_NAME = `John ${last_name}`;

        cy.intercept("PUT", "/api/user/*").as("updateUser");
        cy.intercept("DELETE", "/api/user/*").as("deactivateUser");
        cy.intercept("PUT", "/api/user/*/reactivate").as("reactivateUser");

        cy.log(
          "'Invite someone' button shouldn't be covered/blocked on smaller screen sizes (metabase#16350)",
        );
        cy.viewport(1000, 600);
        cy.visit("/admin/people");
        clickButton("Invite someone");
        cy.viewport(1280, 800);

        // Fill in user details
        cy.findByLabelText("First name").type(first_name);
        cy.findByLabelText("Last name").type(last_name);
        cy.findByLabelText(/Email/).type(email);

        // Add user to Administrators group
        H.modal().findByRole("combobox", { name: "Groups" }).click();
        H.popover().findByText("Administrators").click();
        // dismiss the open dropdown so it doesn't cover the submit button
        H.modal().findByText("Create user").click();

        clickButton("Create");

        // Close the success modal
        H.modal().findByText(`${FULL_NAME} has been added`);
        H.modal().findByText("Done").click();
        cy.location("pathname").should("eq", "/admin/people");

        cy.log(
          "Admin privileges apply as soon as the user is created (metabase#60241)",
        );
        cy.findByTestId("admin-people-list-table").within(() => {
          cy.findByText(FULL_NAME)
            .closest("tr")
            .within(() => {
              cy.findByText("Admin").should("exist");
            });
        });

        cy.visit(`/admin/people/groups/${ADMIN_GROUP}`);
        cy.findByTestId("admin-layout-content")
          .findByText(FULL_NAME)
          .should("exist");

        cy.log("Edit the user");
        cy.visit("/admin/people");
        showUserOptions(FULL_NAME);
        H.popover().findByText("Edit user").click();
        H.modal().within(() => {
          cy.findByLabelText("First name").clear().type("John");
          clickButton("Update");
        });
        cy.wait("@updateUser");

        cy.reload();
        cy.findByTestId("admin-people-list-table")
          .findByText(NEW_FULL_NAME)
          .should("exist");

        cy.log("Deactivate the user");
        showUserOptions(NEW_FULL_NAME);
        H.popover().findByText("Deactivate user").click();
        clickButton("Deactivate");
        cy.wait("@deactivateUser");

        cy.reload();
        cy.findByTestId("admin-people-list-table").within(() => {
          cy.findByText(adminUserName).should("exist");
          cy.findByText(NEW_FULL_NAME).should("not.exist");
        });

        cy.log("Deactivated users drop out of their groups");
        cy.visit(`/admin/people/groups/${ADMIN_GROUP}`);
        cy.findByTestId("admin-layout-content").within(() => {
          cy.findByText(adminUserName).should("exist");
          cy.findByText(NEW_FULL_NAME).should("not.exist");
        });

        cy.log("Reactivate the user");
        cy.visit("/admin/people");
        cy.findByRole("tab", { name: "Deactivated" }).click();
        cy.findByTestId("admin-people-list-table")
          .findByText(NEW_FULL_NAME)
          .closest("tr")
          .icon("refresh")
          .click();
        H.modal().findByText(`Reactivate ${NEW_FULL_NAME}?`);
        clickButton("Reactivate");
        cy.wait("@reactivateUser");

        cy.reload();
        cy.findByTestId("admin-people-list-table")
          .findByText(NEW_FULL_NAME)
          .should("exist");
      },
    );

    it("should generate a password reset link and reset user password without SMTP set up", () => {
      cy.intercept("POST", "/api/user/*/password-reset-url").as("getResetUrl");

      cy.visit("/admin/people");

      cy.log("should generate a password reset link without SMTP set up");
      showUserOptions(normalUserName);
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Reset password").click();

      H.modal().within(() => {
        cy.findByText(`Reset ${normalUserName}'s password?`);
        cy.button("Get reset link").click();
      });

      cy.wait("@getResetUrl");

      H.modal().within(() => {
        cy.findByText(`Password reset link for ${normalUserName}`);
        cy.findByText(
          "Share this link with the user. It will expire in 48 hours.",
        );
        cy.findByRole("textbox")
          .invoke("val")
          .should("contain", "reset_password");
        cy.button("Done").click();
      });

      cy.location().should((loc) =>
        expect(loc.pathname).to.eq("/admin/people"),
      );

      cy.log("should reset user password without SMTP set up");
      showUserOptions(normalUserName);
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Reset password").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Reset ${normalUserName}'s password?`);

      H.modal().within(() => {
        cy.findByText("Are you sure you want to do this?");
        cy.button("Cancel").should("exist");
        cy.button("Get reset link").should("exist");
        cy.button("Reset password").click();
      });

      H.modal().within(() => {
        cy.findByText(`${normalUserName}'s password has been reset`).should(
          "be.visible",
        );
        cy.findByLabelText(/^temporary password$/i).should(
          "have.attr",
          "type",
          "password",
        );
        cy.findByLabelText("Toggle password visibility").click();
        cy.findByLabelText(/^temporary password$/i).should(
          "have.attr",
          "type",
          "text",
        );

        clickButton("Done");
      });

      cy.location().should((loc) =>
        expect(loc.pathname).to.eq("/admin/people"),
      );
    });

    it(
      "should reset user password with SMTP set up",
      { tags: "@external" },
      () => {
        H.setupSMTP();

        cy.visit("/admin/people");
        showUserOptions(normalUserName);
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Reset password").click();
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`Reset ${normalUserName}'s password?`);

        H.modal().within(() => {
          cy.button("Get reset link").should("exist");
          cy.button("Reset password").click();
        });

        H.undoToast().within(() => {
          cy.findByText(
            `Password reset email sent to ${normalUserName}`,
          ).should("be.visible");
        });

        cy.log("Should not show temporary password modal");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText(`${normalUserName}'s password has been reset`).should(
          "not.exist",
        );
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText(/^temporary password$/i).should("not.exist");

        cy.log("Should close the modal");
        H.modal().should("not.exist");
      },
    );

    it("should create and remove groups, show API errors from group endpoints and count the API keys of a group (metabase#52886)", () => {
      const longGroupName = "a".repeat(300);
      cy.intercept("POST", "/api/permissions/group").as("createGroup");
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");

      H.createApiKey("MyApiKey", COLLECTION_GROUP_ID);
      cy.visit("/admin/people/groups");
      cy.wait(["@getGroups", "@listApiKeys"]);

      cy.findByTestId("admin-panel").within(() => {
        cy.button("Create a group").click();
        cy.findByPlaceholderText(/something like/i).type("My New Group");
        cy.button("Add").click();
        cy.wait(["@createGroup", "@getGroups"]);
      });

      cy.log("should show API errors from group endpoints (metabase#52886)");
      cy.findByTestId("admin-panel").within(() => {
        cy.button("Create a group").click();
        cy.findByPlaceholderText(/something like/i).type(longGroupName);
        cy.button("Add").click();
      });
      cy.findByTestId("alert-modal").should("exist");
      H.modal().findByText("Ok").click();

      cy.reload();
      cy.findByTestId("admin-panel")
        .findByText("My New Group")
        .closest("tr")
        .icon("ellipsis")
        .click();
      H.popover().findByText("Remove Group").click();
      H.modal().button("Remove group").click();
      cy.wait(["@deleteGroup", "@getGroups"]);

      cy.reload();
      cy.log("should display api keys included in a group");
      cy.findByTestId("admin-panel")
        .findByText("collection")
        .closest("tr")
        .findByText("(includes 1 API key)");
      cy.findByTestId("admin-panel")
        .findByText("My New Group")
        .should("not.exist");
    });
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
        if (card_id == null) {
          throw new Error("The dashboard card has no question");
        }
        H.createQuestionAlert({
          user_id,
          card_id,
          send_once: false,
          send_condition: "has_result",
          cron_schedule: "0 0 9 * * ?",
        });
        // `H.createPulse` types its cards and channels as full objects; the API takes these partial ones.
        cy.request(
          "POST",
          "/api/pulse",
          getPulseDetails({ card_id, dashboard_id }),
        );
      });
    });

    cy.visit("/account/notifications");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Dashboard");

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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("not.exist");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Dashboard").should("not.exist");
  });
});

describe("scenarios > admin > people > group managers", () => {
  function confirmLosingAbilityToManageGroup() {
    H.modal().within(() => {
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
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.visit("/admin/people");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(normalUserName)
      .closest("tr")
      .findByText("2 other groups")
      .click();

    cy.findAllByTestId("user-type-toggle").click({ multiple: true });

    cy.signInAsNormalUser();
    cy.visit("/");
    H.goToAdmin();
  });

  describe("group managers", () => {
    it("can manage groups from the group page", () => {
      cy.findByTestId("admin-layout-sidebar").within(() => {
        cy.findByTextEnsureVisible("Groups").click();
      });

      // Edit group name
      cy.icon("ellipsis").eq(0).click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit Name").click();
      cy.findByDisplayValue("collection").type(" updated");
      cy.button("Done").click();

      // Click on the group with the new name
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("collection updated").click();

      // Add "No Collection" user as a member
      cy.button("Add members").click();
      cy.focused().type("No");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName).click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add").click();

      // Find user row
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName).should("not.exist");

      // Demote myself
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("data").click();

      // Remove myself
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(noCollectionUserName)
        .closest("tr")
        .as("userRow")
        .within(() => {
          cy.findByText("data").click();
        });

      // Add the user to a group
      H.popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("2 other groups");
      });

      // Remove the user from the group
      H.popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("data");
      });

      // Promote and then demote the user
      H.popover().within(() => {
        cy.icon("arrow_up").click();
        cy.icon("arrow_down").click();
      });

      // Find own row
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normalUserName)
        .closest("tr")
        .within(() => {
          cy.findByText("2 other groups").click();
        });

      // Demote myself from being manager
      H.popover().findByRole("button", { name: "collection" }).click();
      confirmLosingAbilityToManageGroup();
      H.popover()
        .findByRole("button", { name: "collection" })
        .should("not.exist");

      // Remove myself from another group
      H.popover().findByRole("button", { name: "data" }).click();
      confirmLosingAbilityToManageGroup();

      // Redirected to the home page
      cy.location("pathname").should("eq", "/");
    });
  });

  it("after removing the last group redirects to the home page", () => {
    cy.findByTestId("admin-layout-sidebar").findByText("Groups").click();

    removeFirstGroup();
    cy.url().should("match", /\/admin\/people\/groups$/);

    removeFirstGroup();
    cy.url().should("match", /\/$/);
  });
});

function showUserOptions(full_name: string) {
  cy.findByText(full_name)
    .closest("tr")
    .within(() => {
      cy.icon("ellipsis").click();
    });
}

function clickButton(button_name: string) {
  cy.button(button_name).should("not.be.disabled").click();
}

function getQuestionDetails() {
  return {
    name: "Question",
    query: {
      "source-table": ORDERS_ID,
    },
  };
}

function getPulseDetails({
  card_id,
  dashboard_id,
}: {
  card_id: CardId;
  dashboard_id: DashboardId;
}) {
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
