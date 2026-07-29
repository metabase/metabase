export function crudGroupMappingsWidget(authenticationMethod) {
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.wait("@getSettings");
  cy.wait("@getSessionProperties");

  // Create mapping, then delete it along with its groups
  createMapping("cn=People1");
  addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);
  // Re-read the mapping from committed server state before deleting it.
  // Each group selection optimistically patches the settings cache, but the
  // setting update also invalidates and refetches session properties; a
  // trailing stale refetch can revert the last-added group. Reloading aborts
  // those in-flight refetches and settles on a single server-read state, so
  // all mapped groups are present when the delete fires one request per group.
  reloadAndConfirmMappingGroupsSettled(authenticationMethod, "cn=People1");
  deleteMappingWithGroups("cn=People1");

  cy.wait(["@deleteGroup", "@deleteGroup"]);

  // Create mapping, then clear its groups of members
  createMapping("cn=People2");
  addGroupsToMapping("cn=People2", ["collection", "readonly"]);
  // Groups deleted along with first mapping should not be offered
  cy.findByText("data").should("not.exist");
  cy.findByText("nosql").should("not.exist");

  reloadAndConfirmMappingGroupsSettled(authenticationMethod, "cn=People2");

  cy.findByTestId("admin-content-table").within(() => {
    cy.icon("close").click({ force: true });
  });
  cy.findByText(/remove all group members/i).click();
  cy.button("Remove mapping and members").click();

  cy.wait(["@clearGroup", "@clearGroup"]);

  cy.visit("/admin/people/groups");
  cy.findByText("data").should("not.exist");
  cy.findByText("nosql").should("not.exist");

  checkThatGroupHasNoMembers("collection");
  checkThatGroupHasNoMembers("readonly");
}

export function checkGroupConsistencyAfterDeletingMappings(
  authenticationMethod,
) {
  cy.visit("/admin/settings/authentication/" + authenticationMethod);

  createMapping("cn=People1");
  addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);

  createMapping("cn=People2");
  addGroupsToMapping("cn=People2", ["data", "collection"]);

  createMapping("cn=People3");
  addGroupsToMapping("cn=People3", ["collection", "readonly"]);

  deleteMappingWithGroups("cn=People2");

  // Scope to the table: the group dropdown is portaled and stays mounted
  // (hidden) after being opened, so a group name can also linger as an
  // off-screen option outside the table.
  cy.findByTestId("admin-content-table").within(() => {
    // cn=People1 will have Admin and nosql as groups
    cy.findByText("1 other group");
    // cn=People3 will have readonly as group
    cy.findByText("readonly");
  });

  // Ensure mappings are as expected after a page reload
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.findByTestId("admin-content-table").within(() => {
    cy.findByText("1 other group");
    cy.findByText("readonly");
  });
}

// Reload the auth settings page and wait until the mapping row reflects its
// fully-settled group set (Administrators + two others, or two non-admin
// groups, both render as "2 other groups"). This is a positive readiness
// anchor: it only passes once mappings and the groups list have loaded from a
// clean server read, guaranteeing every group is mapped before we act on it.
const reloadAndConfirmMappingGroupsSettled = (
  authenticationMethod,
  mappingName,
) => {
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.findByText(mappingName).closest("tr").should("contain", "2 other groups");
};

const deleteMappingWithGroups = (mappingName) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.icon("close").click({ force: true });
    });

  cy.findByText(/delete the groups/i).click();
  cy.button("Remove mapping and delete groups").click();
};

const createMapping = (name) => {
  cy.button("New mapping").click();
  cy.findByLabelText("New group mapping name").type(name);
  cy.button("Add").click();
};

const addGroupsToMapping = (mappingName, groups) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.findByText("Default").click();
    });

  groups.forEach((group) => {
    cy.findByRole("option", { name: group }).click();
    // Wait for the selection to round-trip before picking the next group
    cy.findByRole("option", { name: group })
      .find("input[type=checkbox]")
      .should("be.checked");
  });

  cy.realPress("{esc}");
};

const checkThatGroupHasNoMembers = (name) => {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.findByText("0"));
};
