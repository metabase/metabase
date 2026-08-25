export function crudGroupMappingsWidget(authenticationMethod) {
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.wait("@getSettings");
  cy.wait("@getSessionProperties");

  // Create mapping, then delete it along with its groups
  createMapping("cn=People1");
  addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);
  deleteMappingWithGroups("cn=People1");

  cy.wait(["@deleteGroup", "@deleteGroup"]);

  // Create mapping, then clear its groups of members
  createMapping("cn=People2");
  addGroupsToMapping("cn=People2", ["collection", "readonly"]);
  // Groups deleted along with first mapping should not be offered
  cy.findByText("data").should("not.exist");
  cy.findByText("nosql").should("not.exist");

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
  cy.wait("@getSettings");
  cy.wait("@getSessionProperties");

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

const deleteMappingWithGroups = (mappingName) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.icon("close").click({ force: true });
    });

  cy.findByText(/delete the groups/i).click();
  cy.button("Remove mapping and delete groups").click();

  // Removing the mapping PUTs the setting and invalidates session properties,
  // triggering a refetch. Wait for both to settle so this trailing refetch
  // can't land mid-flight during a later mapping's edits and revert its state
  // (same last-write-wins hazard guarded against in addGroupsToMapping).
  cy.wait("@updateSetting");
  cy.wait("@getSessionProperties");
};

const createMapping = (name) => {
  cy.button("New mapping").click();
  cy.findByLabelText("New group mapping name").type(name);
  cy.button("Add").click();

  // Adding the mapping PUTs the setting and triggers a session-properties
  // refetch. Wait for both so the widget's mappings state is fully settled
  // from a completed round-trip before we start adding groups to it.
  cy.wait("@updateSetting");
  cy.wait("@getSessionProperties");
};

const addGroupsToMapping = (mappingName, groups) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.findByText("Default").click();
    });

  groups.forEach((group) => {
    cy.findByRole("option", { name: group }).click();

    // Each selection PUTs the mapping (built from the widget's current mappings
    // cache) and invalidates session properties, triggering a refetch. If the
    // next selection fires before this round-trip settles, a trailing stale
    // refetch can revert the just-added group in the cache and the next PUT is
    // then built from that stale set, dropping the group server-side
    // (last-write-wins). Fewer groups then remain than the test deletes, so
    // fewer deleteGroup requests fire and cy.wait times out. Wait for the PUT
    // and the trailing refetch to settle before picking the next group.
    cy.wait("@updateSetting");
    cy.wait("@getSessionProperties");
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
