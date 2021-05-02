// Includes migrations from integration tests:
// https://github.com/metabase/metabase/pull/14174

import { restore, popover, setupDummySMTP } from "__support__/e2e/cypress";
import { USERS, USER_GROUPS } from "__support__/e2e/cypress_data";
const { normal, admin } = USERS;
const { DATA_GROUP } = USER_GROUPS;
const TOTAL_USERS = Object.entries(USERS).length;
const TOTAL_GROUPS = Object.entries(USER_GROUPS).length;

describe("scenarios > admin > people", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const TEST_USER = {
    first_name: "Testy",
    last_name: "McTestface",
    email: `testy${Math.round(Math.random() * 100000)}@metabase.com`,
    password: "12341234",
  };

  describe("user management", () => {
    it("should render (metabase-enterprise#210)", () => {
      cy.visit("/admin/people");

      cy.log("Assert it loads People by default");
      cy.get(".PageTitle").contains("People");

      cy.get(".ContentTable tbody tr")
        .as("result-rows")
        // Bobby Tables, No Collection Tableton, No Data Tableton, None Tableton, Robert Tableton
        .should("have.length", TOTAL_USERS);

      // A small sidebar selector
      cy.get(".AdminList-items").within(() => {
        cy.findByText("People").should("have.class", "selected");
        cy.findByText("Groups").click();
      });

      cy.log("Switch to 'Groups' and make sure it renders properly");
      cy.get(".PageTitle").contains("Groups");

      // Administrators, All Users, collection, data
      cy.get("@result-rows").should("have.length", TOTAL_GROUPS);

      cy.get(".AdminList-items").within(() => {
        cy.findByText("Groups").should("have.class", "selected");
      });

      cy.log(
        "**Dig into one of the user groups and make sure its members are listed**",
      );
      cy.findByText("All Users").click();
      cy.get(".PageTitle").contains("All Users");

      // The same list as for "People"
      cy.get("@result-rows").should("have.length", TOTAL_USERS);
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
      clickButton("Add someone");

      // first modal
      cy.findByLabelText("First name").type(first_name);
      cy.findByLabelText("Last name").type(last_name);
      // bit of a hack since there are multiple "Email" nodes
      cy.findByLabelText("Email").type(email);
      clickButton("Create");

      // second modal
      cy.findByText(`${FULL_NAME} has been added`);
      cy.findByText("Show").click();
      cy.findByText("Done").click();

      cy.findByText(FULL_NAME);
    });

    it("should disallow admin to create new users with case mutation of existing user", () => {
      const { first_name, last_name, email } = normal;
      cy.visit("/admin/people");
      clickButton("Add someone");

      cy.findByLabelText("First name").type(first_name + "New");
      cy.findByLabelText("Last name").type(last_name + "New");
      cy.findByLabelText("Email").type(email.toUpperCase());
      clickButton("Create");
      cy.contains("Email address already in use.");
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
        // It redirects to all people listing
        cy.findByText("Deactivated").should("not.exist");
        cy.findByText("Add someone");
        cy.findByText(FULL_NAME);
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
      cy.findByDisplayValue(first_name)
        .click()
        .clear()
        .type(NEW_NAME);

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
      cy.findByText(`${first_name}'s password has been reset`);
      cy.findByText(/^temporary password$/i);
      clickButton("Done");
    });

    it("should reset user password with SMTP set up", () => {
      const { first_name, last_name } = normal;
      const FULL_NAME = `${first_name} ${last_name}`;

      setupDummySMTP();

      cy.visit("/admin/people");
      showUserOptions(FULL_NAME);
      cy.findByText("Reset password").click();
      cy.findByText(`Reset ${FULL_NAME}'s password?`);
      clickButton("Reset password");
      cy.findByText(`${first_name}'s password has been reset`).should(
        "not.exist",
      );
      cy.findByText(/^temporary password$/i).should("not.exist");
    });
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
  cy.findByText(button_name)
    .closest(".Button")
    .should("not.be.disabled")
    .click();
}
