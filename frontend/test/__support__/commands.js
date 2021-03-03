Cypress.Commands.add("icon", icon_name => {
  cy.get(`.Icon-${icon_name}`);
});

Cypress.Commands.add("createDashboard", name => {
  cy.log(`Create a dashboard: ${name}`);
  cy.request("POST", "/api/dashboard", { name });
});

Cypress.Commands.add(
  "createQuestion",
  ({
    name = "card",
    query = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "query",
        query,
        database,
      },
      display,
      visualization_settings,
    });
  },
);

Cypress.Commands.add(
  "createNativeQuestion",
  ({
    name = "native",
    native = {},
    display = "table",
    database = 1,
    visualization_settings = {},
  } = {}) => {
    cy.log(`Create a native question: ${name}`);
    cy.request("POST", "/api/card", {
      name,
      dataset_query: {
        type: "native",
        native,
        database,
      },
      display,
      visualization_settings,
    });
  },
);

Cypress.Commands.add(
  "sandbox",
  ({
    attribute_remappings = {},
    card_id = null,
    group_id = 4,
    table_id = 2,
  } = {}) => {
    // Extract the name of the table
    cy.request("GET", "/api/table").then(({ body: tables }) => {
      const [{ name }] = tables.filter(table => {
        return table.id === table_id;
      });
      const [attr] = Object.keys(attribute_remappings);

      cy.log(`Sandbox "${name}" table on "${attr}" attribute`);
      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings,
        card_id,
        group_id,
        table_id,
      });
    });
  },
);

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

    cy.log("Fetch permissions graph");
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

/**
 * OVERWRITES
 */

Cypress.Commands.overwrite("log", (originalFn, message) => {
  Cypress.log({
    displayName: `--- ${window.logCalls}. ${message} ---`,
    name: `--- ${window.logCalls}. ${message} ---`,
    message: "",
  });

  window.logCalls++;
});

// We want to reset the log counter for every new test (do not remove from this file)
beforeEach(() => {
  window.logCalls = 1;
});
