import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import type {
  CollectionPermissions,
  CollectionPermissionsGraph,
  DatabaseId,
  GroupId,
  GroupPermissions,
  Impersonation,
  PermissionsGraph,
  SchemasPermissions,
} from "metabase-types/api";

interface UpdatePermissionsSchemasParams {
  /**
   * Defaults to {}.
   */
  schemas?: SchemasPermissions;
  /**
   * Defaults to COLLECTION_GROUP.
   */
  user_group?: GroupId;
  /**
   * Defaults to SAMPLE_DB_ID.
   */
  database_id?: DatabaseId;
}

declare global {
  namespace Cypress {
    interface Chainable {
      updatePermissionsGraph(
        groupsPermissionsObject: GroupPermissions,
        impersonations?: Impersonation[],
      ): void;
      updatePermissionsSchemas(options?: UpdatePermissionsSchemasParams): void;
      updateCollectionGraph(
        groupsCollectionObject: CollectionPermissions,
      ): void;
    }
  }
}

const { COLLECTION_GROUP } = USER_GROUPS;

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
    groupsPermissionsObject: GroupPermissions,
    impersonations?: Impersonation[],
  ) => {
    cy.log("Fetch permissions graph");
    cy.request<PermissionsGraph>("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsPermissionsObject);

        const payload = {
          groups: UPDATED_GROUPS,
          revision,
          impersonations,
        };

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", payload);
      },
    );
  },
);

Cypress.Commands.add(
  "updatePermissionsSchemas",
  ({
    schemas = {},
    user_group = COLLECTION_GROUP,
    database_id = SAMPLE_DB_ID,
  }: UpdatePermissionsSchemasParams = {}) => {
    if (typeof schemas !== "object") {
      throw new Error("`schemas` must be an object!");
    }

    cy.request<PermissionsGraph>("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, {
          [user_group]: {
            [database_id]: {
              data: {
                schemas,
              },
            },
          },
        });

        cy.log("Update/save permissions");
        cy.request("PUT", "/api/permissions/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
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
