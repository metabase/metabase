import type { PermissionsGraph } from "metabase-types/api";

export function addUserToGroup(groupId: number, email: string) {
  return cy
    .request<{ data: Array<{ id: number; email: string }> }>("/api/user")
    .then(({ body }) => {
      const user = body.data.find((candidate) => candidate.email === email);

      if (!user) {
        throw new Error(`No user with the email ${email}`);
      }

      return cy.request("POST", "/api/permissions/membership", {
        group_id: groupId,
        user_id: user.id,
      });
    });
}

/** The group's whole per-database entry, `create-queries` included. */
export function getPermissionByGroup(groupId: number) {
  return cy
    .request<PermissionsGraph>("GET", "/api/permissions/graph")
    .then(({ body }) => body.groups[String(groupId)] ?? {});
}

/** The group's view-data level per database, as the permissions graph reports it. */
export function getViewDataPermissionByGroup(groupId: number) {
  return getPermissionByGroup(groupId).then((graph) =>
    Object.fromEntries(
      Object.entries(graph).map(([databaseId, permissions]) => [
        databaseId,
        permissions["view-data"],
      ]),
    ),
  );
}
