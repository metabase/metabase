import { popover } from "e2e/support/helpers";

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

  cy.icon("close").click({ force: true });
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

  // cn=People1 will have Admin and nosql as groups
  cy.findByText("1 other group");

  // cn=People3 will have readonly as group
  cy.findByText("readonly");

  // Ensure mappings are as expected after a page reload
  cy.visit("/admin/settings/authentication/" + authenticationMethod);
  cy.findByText("1 other group");
  cy.findByText("readonly");
}

const deleteMappingWithGroups = mappingName => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.icon("close").click({ force: true });
    });

  cy.findByText(/delete the groups/i).click();
  cy.button("Remove mapping and delete groups").click();
};

const createMapping = name => {
  cy.button("New mapping").click();
  cy.findByLabelText("new-group-mapping-name-input").type(name);
  cy.button("Add").click();
};

const addGroupsToMapping = (mappingName, groups) => {
  cy.findByText(mappingName)
    .closest("tr")
    .within(() => {
      cy.findByText("Default").click();
    });

  groups.forEach(group => {
    popover().within(() => {
      cy.findByText(group).click();

      cy.findByText(group)
        .closest(".List-section")
        .within(() => {
          cy.icon("check");
        });
    });
  });

  cy.realPress("{esc}");
};

const checkThatGroupHasNoMembers = name => {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.findByText("0"));
};
