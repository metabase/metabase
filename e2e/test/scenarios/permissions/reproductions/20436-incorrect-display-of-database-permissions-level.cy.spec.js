import { restore, popover } from "e2e/support/helpers";
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const url = `/admin/permissions/data/group/${ALL_USERS_GROUP}`;

describe("issue 20436", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/permissions/graph").as("updatePermissions");

    restore();
    cy.signInAsAdmin();

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: { data: { schemas: "all", native: "none" } },
      },
    });
  });

  it("should display correct permissions on the database level after changes on the table level (metabase#20436)", () => {
    cy.visit(url);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Unrestricted");

    // Go the the view where we can change permissions for individual tables
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sample Database").click();

    // Change the permission levels for ANY of the tables - it doesn't matter which one
    changePermissions("Unrestricted", "No self-service");

    cy.button("Change").click();
    saveChanges();
    cy.wait("@updatePermissions");

    // Now turn it back to the "Unrestricted" access
    changePermissions("No self-service", "Unrestricted");

    saveChanges();
    cy.wait("@updatePermissions");

    cy.visit(url);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Unrestricted");
  });
});

function changePermissions(from, to) {
  cy.findAllByText(from).first().click();

  popover().contains(to).click();
}

function saveChanges() {
  cy.button("Save changes").click();
  cy.button("Yes").click();
}
