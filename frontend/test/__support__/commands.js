Cypress.Commands.add("icon", icon_name => {
  cy.get(`.Icon-${icon_name}`);
});

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

    cy.log("**-- Fetch permissions graph --**");
    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, groupsPermissionsObject);

        cy.log("**-- Update/save permissions --**");
        cy.request("PUT", "/api/permissions/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
  },
);

Cypress.Commands.add(
  "updatePermissionsSchema",
  ({ schema = {}, user_group = 4, database_id = 1 } = {}) => {
    if (typeof schema !== "object") {
      throw new Error("`schema` must be an object!");
    }

    cy.log("**-- Fetch permissions graph --**");
    cy.request("GET", "/api/permissions/graph").then(
      ({ body: { groups, revision } }) => {
        const UPDATED_GROUPS = Object.assign(groups, {
          [user_group]: {
            [database_id]: {
              schemas: {
                public: schema,
              },
            },
          },
        });

        cy.log("**-- Update/save permissions --**");
        cy.request("PUT", "/api/permissions/graph", {
          groups: UPDATED_GROUPS,
          revision,
        });
      },
    );
  },
);
