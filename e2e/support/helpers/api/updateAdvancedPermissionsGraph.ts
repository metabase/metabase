type ApplicationPermissionValue = "yes" | "no";

type ApplicationPermissions = {
  monitoring?: ApplicationPermissionValue;
  setting?: ApplicationPermissionValue;
  subscription?: ApplicationPermissionValue;
};

type ApplicationPermissionsGroups = Record<number, ApplicationPermissions>;

type ApplicationPermissionsGraph = {
  groups: ApplicationPermissionsGroups;
  revision: number;
};

export function updateAdvancedPermissionsGraph(
  groupsPermissionsObject: ApplicationPermissionsGroups,
): Cypress.Chainable<Cypress.Response<ApplicationPermissionsGraph>> {
  return cy
    .request<ApplicationPermissionsGraph>(
      "GET",
      "/api/ee/advanced-permissions/application/graph",
    )
    .then(({ body: { groups, revision } }) => {
      const updatedGroups: ApplicationPermissionsGroups = { ...groups };
      for (const [groupId, permissions] of Object.entries(
        groupsPermissionsObject,
      )) {
        updatedGroups[Number(groupId)] = {
          ...updatedGroups[Number(groupId)],
          ...permissions,
        };
      }

      return cy.request<ApplicationPermissionsGraph>(
        "PUT",
        "/api/ee/advanced-permissions/application/graph",
        {
          groups: updatedGroups,
          revision,
        },
      );
    });
}
