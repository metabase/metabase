import type {
  AdvancedPermissionsGraph,
  AdvancedPermissionsGroups,
} from "metabase-types/api";

export function updateAdvancedPermissionsGraph(
  groupsPermissionsObject: AdvancedPermissionsGroups,
): Cypress.Chainable<Cypress.Response<AdvancedPermissionsGraph>> {
  return cy
    .request<AdvancedPermissionsGraph>(
      "GET",
      "/api/ee/advanced-permissions/application/graph",
    )
    .then(({ body: { groups, revision } }) => {
      const updatedGroups: AdvancedPermissionsGroups = { ...groups };
      for (const [groupId, permissions] of Object.entries(
        groupsPermissionsObject,
      )) {
        updatedGroups[Number(groupId)] = {
          ...updatedGroups[Number(groupId)],
          ...permissions,
        };
      }

      return cy.request<AdvancedPermissionsGraph>(
        "PUT",
        "/api/ee/advanced-permissions/application/graph",
        {
          groups: updatedGroups,
          revision,
        },
      );
    });
}
