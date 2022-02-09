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
  (groupsPermissionsObject = {}) => {
    if (typeof groupsPermissionsObject !== "object") {
      throw new Error("`groupsPermissionsObject` must be an object!");
    }

    cy.log("Fetch permissions graph");
    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsPermissionsObject);

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
  "updatePermissionsSchemas",
  ({ schemas = {}, user_group = 4, database_id = 1 } = {}) => {
    if (typeof schemas !== "object") {
      throw new Error("`schemas` must be an object!");
    }

    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, {
          [user_group]: {
            [database_id]: {
              schemas,
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

Cypress.Commands.add("updateCollectionGraph", (groupsCollectionObject = {}) => {
  if (typeof groupsCollectionObject !== "object") {
    throw new Error("`groupsCollectionObject` must be an object!");
  }

  cy.log("Fetch permissions graph");
  cy.request("GET", "/api/collection/graph").then(
    ({ body: { groups, revision } }) => {
      const UPDATED_GROUPS = Object.assign(groups, groupsCollectionObject);

      cy.log("Update/save permissions");
      cy.request("PUT", "/api/collection/graph", {
        groups: UPDATED_GROUPS,
        revision,
      });
    },
  );
});
