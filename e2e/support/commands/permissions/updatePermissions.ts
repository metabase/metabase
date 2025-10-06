import type {
  CollectionPermissions,
  CollectionPermissionsGraph,
  GroupsPermissions,
  Impersonation,
  PermissionsGraph,
} from "metabase-types/api";

declare global {
  namespace Cypress {
    interface Chainable {
      updatePermissionsGraph(
        groupsPermissionsObject: GroupsPermissions,
        impersonations?: Impersonation[],
      ): void;
      updateCollectionGraph(
        groupsCollectionObject: CollectionPermissions,
      ): void;
    }
  }
}

/**
 * PERMISSIONS
 *
 * As per definition for `PUT /graph` from `permissions.clj`:
 *
 * "This should return the same graph, in the same format,
 * that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary.
 * This modified graph must correspond to the `PermissionsGraph` schema."
 *
 * That's why we must chain GET and PUT requests one after the other.
 */

Cypress.Commands.add(
  "updatePermissionsGraph",
  (
    groupsPermissionsObject: GroupsPermissions,
    impersonations?: Impersonation[],
  ) => {
    cy.log("Fetch permissions graph");
    return cy
      .request<PermissionsGraph>("GET", "/api/permissions/graph")
      .then(({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsPermissionsObject);

        const payload = {
          groups: UPDATED_GROUPS,
          revision,
          impersonations,
        };

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", payload);
      });
  },
);

Cypress.Commands.add(
  "updateCollectionGraph",
  (groupsCollectionObject: CollectionPermissions) => {
    cy.log("Fetch permissions graph");
    cy.request<CollectionPermissionsGraph>("GET", "/api/collection/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsCollectionObject);

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/collection/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
  },
);
