export function checkGroupMappingsWidget(authenticationMethod) {
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.wait("@getSettings");
  cy.wait("@getSessionProperties");

  createMapping("cn=People1");
  addGroupsToMapping("cn=People1", ["Administrators", "data", "nosql"]);

  createMapping("cn=People2");
  addGroupsToMapping("cn=People2", ["data", "collection"]);

  createMapping("cn=People3");
  addGroupsToMapping("cn=People3", ["collection", "readonly"]);

  cy.log(
    "Deleting a mapping with its groups keeps the remaining mappings consistent",
  );
  deleteMapping(
    "cn=People2",
    /delete the groups/i,
    "Remove mapping and delete groups",
  );
  cy.wait(["@deleteGroup", "@deleteGroup"]);

  // Scope to the table: the group dropdown is portaled, so a group name can
  // also show up as an option outside the table.
  cy.findByTestId("admin-content-table").within(() => {
    // cn=People1 will have Admin and nosql as groups
    cy.findByText("1 other group");
    // cn=People3 will have readonly as group
    cy.findByText("readonly");
  });

  cy.log("Deleted groups are no longer offered for mappings");
  mappingRow("cn=People3").findByText("readonly").click();
  cy.findByRole("option", { name: "readonly" }).should("exist");
  cy.findByRole("option", { name: "data" }).should("not.exist");
  cy.findByRole("option", { name: "collection" }).should("not.exist");
  cy.realPress("{esc}");

  cy.log("Mappings are as expected after a page reload");
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.findByTestId("admin-content-table").within(() => {
    cy.findByText("1 other group");
    cy.findByText("readonly");
  });

  cy.log(
    "Deleting mappings while clearing their groups empties the groups, skipping Administrators",
  );
  deleteMapping(
    "cn=People3",
    /remove all members/i,
    "Remove mapping and members",
  );
  cy.wait("@clearGroup");
  deleteMapping(
    "cn=People1",
    /remove all members/i,
    "Remove mapping and members",
  );
  cy.wait("@clearGroup");

  cy.visit("/admin/people/groups");
  cy.findByText("data").should("not.exist");
  cy.findByText("collection").should("not.exist");

  checkThatGroupHasNoMembers("nosql");
  checkThatGroupHasNoMembers("readonly");
}

const mappingRow = (mappingName) => cy.findByText(mappingName).closest("tr");

const deleteMapping = (mappingName, consequenceLabel, confirmLabel) => {
  mappingRow(mappingName).within(() => {
    cy.icon("close").click({ force: true });
  });

  cy.findByText(consequenceLabel).click();
  cy.button(confirmLabel).click();

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
  mappingRow(mappingName).within(() => {
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
