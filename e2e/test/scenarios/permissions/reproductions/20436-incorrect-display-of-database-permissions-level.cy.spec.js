import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  describeEE,
  restore,
  popover,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const url = `/admin/permissions/data/group/${ALL_USERS_GROUP}`;

describeEE("issue 20436", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/permissions/graph").as("updatePermissions");

    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: {
          data: { schemas: "all", native: "none" },
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("should display correct permissions on the database level after changes on the table level (metabase#20436)", () => {
    cy.visit(url);

    cy.findByTestId("permission-table").within(() => {
      cy.findByText("Query builder only").click();
    });

    popover().within(() => {
      cy.findByText("Granular").click();
    });

    // Change the permission levels for ANY of the tables - it doesn't matter which one
    changePermissions("No", "Query builder only");

    saveChanges();
    cy.wait("@updatePermissions");

    // Now turn it back to the "Unrestricted" access
    changePermissions("Query builder only", "No");

    saveChanges();
    cy.wait("@updatePermissions");

    cy.visit(url);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Query builder only");
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
