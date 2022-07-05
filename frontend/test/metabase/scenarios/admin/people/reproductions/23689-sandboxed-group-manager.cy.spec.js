import { restore, describeEE } from "__support__/e2e/helpers";
import { USERS, USER_GROUPS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { COLLECTION_GROUP } = USER_GROUPS;
const { sandboxed, normal, nodata } = USERS;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeEE("issue 23689", () => {
  beforeEach(() => {
    // TODO: remove the next line when this issue gets fixed
    cy.skipOn(true);

    cy.intercept("GET", "/api/permissions/membership").as("membership");

    restore();
    cy.signInAsAdmin();

    visitGroupPermissionsPage(COLLECTION_GROUP);

    cy.findByText("3 members");

    findUserByFullName(normal);
    findUserByFullName(nodata);

    // Make sandboxed user a group manager
    findUserByFullName(sandboxed)
      .closest("tr")
      .findByTestId("user-type-toggle")
      .click({ force: true });

    // Sanity check instead of waiting for the PUT request
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

  it("sandboxed group manager should see all group members (metabase#23689)", () => {
    visitGroupPermissionsPage(COLLECTION_GROUP);

    cy.findByText("3 members");

    findUserByFullName(sandboxed);
    findUserByFullName(normal);
    findUserByFullName(nodata);
  });
});

function findUserByFullName(user) {
  const { first_name, last_name } = user;
  return cy.findByText(`${first_name} ${last_name}`);
}

function visitGroupPermissionsPage(groupId) {
  cy.visit(`/admin/people/groups/${COLLECTION_GROUP}`);
  cy.wait("@membership");
}
